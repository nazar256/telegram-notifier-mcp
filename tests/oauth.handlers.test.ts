import { afterEach, describe, expect, it, vi } from "vitest";

import { parseConfig } from "../src/config";
import { handleAuthorizeGet, handleAuthorizePost } from "../src/oauth/authorize";
import { handleRegister } from "../src/oauth/register";
import { handleToken } from "../src/oauth/token";
import { makeEnv } from "./helpers";

const redirectUri = "https://chat.openai.com/oauth/callback";
const codeVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const codeChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("oauth handlers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers a deterministic public client and rejects invalid redirects", async () => {
    const config = parseConfig(makeEnv());

    const goodRequestBody = JSON.stringify({ redirect_uris: [redirectUri] });
    const goodRequest = new Request("https://example.com/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: goodRequestBody,
    });
    const first = await handleRegister(goodRequest, config);
    const second = await handleRegister(
      new Request("https://example.com/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: goodRequestBody,
      }),
      config,
    );
    const firstJson = (await first.json()) as { client_id: string };
    const secondJson = (await second.json()) as { client_id: string };

    expect(first.status).toBe(200);
    expect(firstJson.client_id).toBe(secondJson.client_id);

    const badRequest = new Request("https://example.com/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["https://evil.example/callback"] }),
    });
    const badResponse = await handleRegister(badRequest, config);
    expect(badResponse.status).toBe(400);
  });

  it("allows loopback native redirects in production and labels them native", async () => {
    const config = parseConfig(
      makeEnv({
        ENVIRONMENT: "production",
        OAUTH_ISSUER: "https://tg-notify.example.workers.dev",
        MCP_RESOURCE: "https://tg-notify.example.workers.dev/mcp",
        MCP_AUDIENCE: "https://tg-notify.example.workers.dev/mcp",
      }),
    );

    const response = await handleRegister(
      new Request("https://example.com/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: ["http://localhost:8004/callback"] }),
      }),
      config,
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { application_type: string; redirect_uris: string[] };
    expect(json.application_type).toBe("native");
    expect(json.redirect_uris).toEqual(["http://localhost:8004/callback"]);
  });

  it("accepts 127.0.0.1 and ::1 loopback native redirects in production", async () => {
    const config = parseConfig(
      makeEnv({
        ENVIRONMENT: "production",
        OAUTH_ISSUER: "https://tg-notify.example.workers.dev",
        MCP_RESOURCE: "https://tg-notify.example.workers.dev/mcp",
        MCP_AUDIENCE: "https://tg-notify.example.workers.dev/mcp",
      }),
    );

    for (const redirect of ["http://127.0.0.1:8004/callback", "http://[::1]:8004/callback"]) {
      const response = await handleRegister(
        new Request("https://example.com/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ redirect_uris: [redirect] }),
        }),
        config,
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as { application_type: string; redirect_uris: string[] };
      expect(json.application_type).toBe("native");
      expect(json.redirect_uris).toEqual([redirect]);
    }
  });

  it("rejects invalid authorize GET params", async () => {
    const config = parseConfig(makeEnv());
    const response = await handleAuthorizeGet(new Request("https://example.com/authorize?client_id=x"), config);
    expect(response.status).toBe(400);
  });

  it("rejects invalid CSRF on authorize POST", async () => {
    const config = parseConfig(makeEnv());
    const clientId = ((await (await handleRegister(
      new Request("https://example.com/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: [redirectUri] }),
      }),
      config,
    )).json()) as { client_id: string }).client_id;

    const form = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state: "state-1",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      resource: config.mcpResource,
      scope: config.scope,
      csrf_token: "bad-token",
      telegram_bot_token: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd",
    });

    const response = await handleAuthorizePost(
      new Request("https://example.com/authorize", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form,
      }),
      config,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/CSRF/i);
  });

  it("returns a clear error when auto-discovery finds no private chat", async () => {
    const config = parseConfig(makeEnv());
    const clientId = ((await (await handleRegister(
      new Request("https://example.com/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: [redirectUri] }),
      }),
      config,
    )).json()) as { client_id: string }).client_id;

    const authorizeGet = await handleAuthorizeGet(
      new Request(
        `https://example.com/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=state-1&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256&resource=${encodeURIComponent(config.mcpResource)}&scope=${encodeURIComponent(config.scope)}`,
      ),
      config,
    );
    const html = await authorizeGet.text();
    const csrfToken = html.match(/name="csrf_token" value="([^"]+)"/)?.[1];
    expect(csrfToken).toBeTruthy();

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, result: { id: 123, is_bot: true, first_name: "Bot", username: "notify_bot" } })),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: [] }))),
    );

    const form = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state: "state-1",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      resource: config.mcpResource,
      scope: config.scope,
      csrf_token: csrfToken!,
      telegram_bot_token: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd",
    });

    const response = await handleAuthorizePost(new Request("https://example.com/authorize", { method: "POST", body: form }), config);
    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/send \/start|No private chat/i);
  });

  it("renders authorize form and redirects without state when native clients omit it", async () => {
    const config = parseConfig(makeEnv());
    const loopbackRedirectUri = "http://localhost:8004/callback";
    const clientId = ((await (await handleRegister(
      new Request("https://example.com/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: [loopbackRedirectUri] }),
      }),
      config,
    )).json()) as { client_id: string; application_type: string }).client_id;

    const authorizeGet = await handleAuthorizeGet(
      new Request(
        `https://example.com/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(loopbackRedirectUri)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256&resource=${encodeURIComponent(config.mcpResource)}&scope=${encodeURIComponent(config.scope)}`,
      ),
      config,
    );

    expect(authorizeGet.status).toBe(200);
    const html = await authorizeGet.text();
    expect(html).toMatch(/Telegram bot token/);
    const csrfToken = html.match(/name="csrf_token" value="([^"]+)"/)?.[1];
    expect(csrfToken).toBeTruthy();

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, result: { id: 123, is_bot: true, first_name: "Bot", username: "notify_bot" } })),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: true,
              result: [
                {
                  update_id: 1,
                  message: {
                    message_id: 1,
                    date: 1,
                    chat: { id: 42, type: "private", first_name: "Alice" },
                    text: "/start",
                  },
                },
              ],
            }),
          ),
        ),
    );

    const authorizeForm = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: loopbackRedirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      resource: config.mcpResource,
      scope: config.scope,
      csrf_token: csrfToken!,
      telegram_bot_token: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd",
    });

    const authorizePost = await handleAuthorizePost(
      new Request("https://example.com/authorize", { method: "POST", body: authorizeForm }),
      config,
    );

    expect(authorizePost.status).toBe(302);
    const location = authorizePost.headers.get("location");
    expect(location).toBeTruthy();
    const redirected = new URL(location!);
    expect(redirected.origin + redirected.pathname).toBe(loopbackRedirectUri);
    expect(redirected.searchParams.get("code")).toBeTruthy();
    expect(redirected.searchParams.has("state")).toBe(false);
  });

  it("issues a code and exchanges it for an access token", async () => {
    const config = parseConfig(makeEnv());
    const clientId = ((await (await handleRegister(
      new Request("https://example.com/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: [redirectUri] }),
      }),
      config,
    )).json()) as { client_id: string }).client_id;

    const authorizeGet = await handleAuthorizeGet(
      new Request(
        `https://example.com/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=state-1&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256&resource=${encodeURIComponent(config.mcpResource)}&scope=${encodeURIComponent(config.scope)}`,
      ),
      config,
    );
    const html = await authorizeGet.text();
    const csrfToken = html.match(/name="csrf_token" value="([^"]+)"/)?.[1];

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, result: { id: 123, is_bot: true, first_name: "Bot", username: "notify_bot" } })),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: true,
              result: [
                {
                  update_id: 1,
                  message: {
                    message_id: 1,
                    date: 1,
                    chat: { id: 42, type: "private", first_name: "Alice" },
                    text: "/start",
                  },
                },
              ],
            }),
          ),
        ),
    );

    const authorizeForm = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state: "state-1",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      resource: config.mcpResource,
      scope: config.scope,
      csrf_token: csrfToken!,
      telegram_bot_token: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd",
      access_token_ttl_choice: "30",
    });

    const authorizePost = await handleAuthorizePost(new Request("https://example.com/authorize", { method: "POST", body: authorizeForm }), config);
    expect(authorizePost.status).toBe(302);
    const location = authorizePost.headers.get("location");
    expect(location).toContain("code=");
    const code = new URL(location!).searchParams.get("code");
    expect(code).toBeTruthy();

    const tokenRequest = new Request("https://example.com/token", {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code: code!,
        code_verifier: codeVerifier,
        resource: config.mcpResource,
      }),
    });
    const tokenResponse = await handleToken(tokenRequest, config);
    const tokenJson = (await tokenResponse.json()) as { access_token: string; scope: string };

    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.headers.get("cache-control")).toBe("no-store");
    expect(tokenResponse.headers.get("pragma")).toBe("no-cache");
    expect(tokenJson.access_token).toBeTruthy();
    expect(tokenJson.scope).toBe("telegram.notify");

    const badPkceResponse = await handleToken(
      new Request("https://example.com/token", {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          redirect_uri: redirectUri,
          code: code!,
          code_verifier: "wrong-verifier-value-that-is-long-enough-to-be-valid-1234567890",
          resource: config.mcpResource,
        }),
      }),
      config,
    );
    expect(badPkceResponse.status).toBe(400);
    expect(await badPkceResponse.text()).toMatch(/PKCE/i);
  });

  it("rejects requested access-token duration above server maximum", async () => {
    const config = parseConfig(makeEnv({ ACCESS_TOKEN_TTL_SECONDS: String(30 * 24 * 60 * 60) }));
    const clientId = ((await (await handleRegister(
      new Request("https://example.com/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: [redirectUri] }),
      }),
      config,
    )).json()) as { client_id: string }).client_id;

    const authorizeGet = await handleAuthorizeGet(
      new Request(
        `https://example.com/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=state-1&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256&resource=${encodeURIComponent(config.mcpResource)}&scope=${encodeURIComponent(config.scope)}`,
      ),
      config,
    );
    const html = await authorizeGet.text();
    const csrfToken = html.match(/name="csrf_token" value="([^"]+)"/)?.[1];

    const response = await handleAuthorizePost(
      new Request("https://example.com/authorize", {
        method: "POST",
        body: new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          state: "state-1",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
          resource: config.mcpResource,
          scope: config.scope,
          csrf_token: csrfToken!,
          telegram_bot_token: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd",
          access_token_ttl_choice: "90",
        }),
      }),
      config,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/server maximum of 30 days/i);
  });
});
