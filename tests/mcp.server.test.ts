import { afterEach, describe, expect, it, vi } from "vitest";

import { handleRequest } from "../src/index";
import { createJsonRpcRequest, createAccessToken, makeEnv } from "./helpers";

describe("mcp server", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns health even when config is invalid", async () => {
    const response = await handleRequest(new Request("https://example.com/health"), {});
    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: boolean };
    expect(json.ok).toBe(false);
  });

  it("returns 401 with WWW-Authenticate when /mcp is unauthenticated", async () => {
    const env = makeEnv();
    const response = await handleRequest(new Request("https://example.com/mcp", { method: "GET" }), env);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/resource_metadata=/);
    expect(response.headers.get("www-authenticate")).toMatch(/telegram\.notify/);
  });

  it("lists tools and calls send_telegram_notification with a valid bearer token", async () => {
    const env = makeEnv();
    const accessToken = await createAccessToken(env);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            result: {
              message_id: 777,
              date: 1,
              chat: { id: 42, type: "private", first_name: "Alice" },
              text: "hello",
            },
          }),
        ),
      ),
    );

    const toolsListResponse = await handleRequest(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-protocol-version": "2025-03-26",
        },
        body: createJsonRpcRequest("tools/list", {}),
      }),
      env,
    );
    expect(toolsListResponse.status).toBe(200);
    const toolsListJson = (await toolsListResponse.json()) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(toolsListJson.result.tools[0].name).toBe("send_telegram_notification");

    const callResponse = await handleRequest(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-protocol-version": "2025-03-26",
        },
        body: createJsonRpcRequest("tools/call", {
          name: "send_telegram_notification",
          arguments: { message: "Hello from test", disable_notification: true },
        }),
      }),
      env,
    );

    expect(callResponse.status).toBe(200);
    const callJson = (await callResponse.json()) as {
      result: { content: Array<{ text: string }> };
    };
    expect(callJson.result.content[0].text).toMatch(/Notification sent successfully/);
  });

  it("returns a sanitized tool error when Telegram send fails", async () => {
    const env = makeEnv();
    const accessToken = await createAccessToken(env);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ ok: false, error_code: 401, description: "Bad token 123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd" }),
          { status: 401 },
        ),
      ),
    );

    const response = await handleRequest(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-protocol-version": "2025-03-26",
        },
        body: createJsonRpcRequest("tools/call", {
          name: "send_telegram_notification",
          arguments: { message: "Hello from test" },
        }),
      }),
      env,
    );

    const json = (await response.json()) as {
      result: { isError: boolean; content: Array<{ text: string }> };
    };
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toMatch(/REDACTED/);
  });
});
