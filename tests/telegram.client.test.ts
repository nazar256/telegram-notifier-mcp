import { afterEach, describe, expect, it, vi } from "vitest";

import { createTelegramClient, resolvePrivateChatId } from "../src/telegram/client";

describe("telegram client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles getMe success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { id: 123, is_bot: true, first_name: "Bot", username: "notify_bot" } })),
    );
    const client = createTelegramClient(fetchMock as typeof fetch);
    const result = await client.getMe("123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd");
    expect(result.id).toBe("123");
    expect(result.username).toBe("notify_bot");
  });

  it("redacts token-like values in Telegram errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error_code: 401, description: "Bad token 123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd" }),
        { status: 401 },
      ),
    );
    const client = createTelegramClient(fetchMock as typeof fetch);
    await expect(client.getMe("123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd")).rejects.toThrow(/REDACTED/);
  });

  it("handles malformed JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("not-json", { status: 200 }));
    const client = createTelegramClient(fetchMock as typeof fetch);
    await expect(client.getUpdates("123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd")).rejects.toThrow(/malformed JSON/i);
  });

  it("resolves an unambiguous private chat id", () => {
    const resolution = resolvePrivateChatId([
      {
        update_id: 1,
        message: {
          message_id: 10,
          date: 1,
          chat: { id: "42", type: "private", first_name: "Alice" },
          text: "/start",
        },
      },
    ]);

    expect(resolution).toEqual({ ok: true, chatId: "42" });
  });

  it("rejects ambiguous private chats", () => {
    const resolution = resolvePrivateChatId([
      {
        update_id: 1,
        message: { message_id: 10, date: 1, chat: { id: "42", type: "private", first_name: "Alice" }, text: "hi" },
      },
      {
        update_id: 2,
        message: { message_id: 11, date: 1, chat: { id: "43", type: "private", first_name: "Bob" }, text: "hi" },
      },
    ]);

    expect(resolution.ok).toBe(false);
  });
});
