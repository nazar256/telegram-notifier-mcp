import { describe, expect, it } from "vitest";

import { DEFAULT_ACCESS_TOKEN_TTL_SECONDS, getConfig, parseConfig } from "../src/config";
import { makeEnv } from "./helpers";

describe("config", () => {
  it("parses a valid environment", () => {
    const config = parseConfig(makeEnv());
    expect(config.oauthIssuer).toBe("https://example.com");
    expect(config.mcpResource).toBe("https://example.com/mcp");
    expect(config.scope).toBe("telegram.notify");
    expect(config.accessTokenTtlSeconds).toBe(DEFAULT_ACCESS_TOKEN_TTL_SECONDS);
  });

  it("rejects missing keys", () => {
    const result = getConfig({});
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/OAUTH_REDIRECT_HTTPS_HOSTS|OAUTH_JWT_SIGNING_KEY_B64/i);
  });

  it("rejects invalid encryption key length", () => {
    const result = getConfig(
      makeEnv({
        UPSTREAM_CONFIG_ENC_KEY_B64: btoa("short"),
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/UPSTREAM_CONFIG_ENC_KEY_B64/);
  });

  it("rejects access-token TTL above one year", () => {
    const result = getConfig(makeEnv({ ACCESS_TOKEN_TTL_SECONDS: "31536001" }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ACCESS_TOKEN_TTL_SECONDS/);
  });

  it("derives issuer and MCP URLs from runtime request origin when omitted", () => {
    const config = parseConfig(
      {
        ...makeEnv(),
        OAUTH_ISSUER: undefined,
        MCP_RESOURCE: undefined,
        MCP_AUDIENCE: undefined,
      },
      "https://derived.example.workers.dev/health",
    );

    expect(config.oauthIssuer).toBe("https://derived.example.workers.dev");
    expect(config.mcpResource).toBe("https://derived.example.workers.dev/mcp");
    expect(config.mcpAudience).toBe("https://derived.example.workers.dev/mcp");
  });
});
