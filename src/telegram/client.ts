import { z } from "zod";

import { redactSecrets, toSafeErrorMessage } from "../security/redact";
import {
  telegramErrorEnvelopeSchema,
  telegramGetMeResultSchema,
  telegramGetUpdatesResultSchema,
  telegramSendMessageResultSchema,
  type TelegramGetMeResult,
  type TelegramGetUpdatesResult,
  type TelegramSendMessageResult,
} from "./validation";

export class TelegramApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly errorCode?: number,
  ) {
    super(message);
    this.name = "TelegramApiError";
  }
}

export interface TelegramClient {
  getMe(botToken: string): Promise<TelegramGetMeResult>;
  getUpdates(botToken: string): Promise<TelegramGetUpdatesResult>;
  sendMessage(
    botToken: string,
    chatId: string,
    message: string,
    options?: { disable_notification?: boolean },
  ): Promise<TelegramSendMessageResult>;
}

function timeoutSignal(milliseconds: number): AbortSignal | undefined {
  const timeoutFactory = (AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }).timeout;
  return timeoutFactory ? timeoutFactory(milliseconds) : undefined;
}

async function parseTelegramResponse<T>(
  response: Response,
  successSchema: z.ZodSchema<T>,
): Promise<T> {
  let json: unknown;

  try {
    json = await response.json();
  } catch {
    throw new TelegramApiError(`Telegram returned malformed JSON (HTTP ${response.status})`, response.status);
  }

  const telegramError = telegramErrorEnvelopeSchema.safeParse(json);
  if (telegramError.success) {
    throw new TelegramApiError(
      redactSecrets(telegramError.data.description ?? "Telegram request failed"),
      response.status,
      telegramError.data.error_code,
    );
  }

  const successEnvelopeSchema = z.object({ ok: z.literal(true), result: successSchema });
  const successEnvelope = successEnvelopeSchema.safeParse(json);
  if (!successEnvelope.success) {
    throw new TelegramApiError(`Telegram response did not match the expected schema (HTTP ${response.status})`, response.status);
  }

  if (!response.ok) {
    throw new TelegramApiError(`Telegram request failed with HTTP ${response.status}`, response.status);
  }

  return successEnvelope.data.result as T;
}

export function createTelegramClient(fetchImpl: typeof fetch = fetch): TelegramClient {
  async function callTelegramMethod<T>(
    botToken: string,
    method: string,
    body: Record<string, unknown>,
    schema: z.ZodSchema<T>,
  ): Promise<T> {
    const url = `https://api.telegram.org/bot${botToken}/${method}`;

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: timeoutSignal(15_000),
      });
    } catch (error) {
      throw new TelegramApiError(`Telegram request failed: ${toSafeErrorMessage(error)}`);
    }

    return parseTelegramResponse(response, schema);
  }

  return {
    getMe(botToken) {
      return callTelegramMethod(botToken, "getMe", {}, telegramGetMeResultSchema);
    },
    getUpdates(botToken) {
      return callTelegramMethod(
        botToken,
        "getUpdates",
        {
          limit: 20,
          timeout: 0,
          allowed_updates: ["message", "edited_message"],
        },
        telegramGetUpdatesResultSchema,
      );
    },
    sendMessage(botToken, chatId, message, options) {
      return callTelegramMethod(
        botToken,
        "sendMessage",
        {
          chat_id: chatId,
          text: message,
          disable_notification: options?.disable_notification ?? false,
          link_preview_options: {
            is_disabled: true,
          },
        },
        telegramSendMessageResultSchema,
      );
    },
  };
}

export function resolvePrivateChatId(updates: TelegramGetUpdatesResult):
  | { ok: true; chatId: string }
  | { ok: false; reason: string } {
  const privateChats = new Map<string, { label: string; updateId: number }>();

  for (const update of updates) {
    const message = update.message ?? update.edited_message;
    if (!message || message.chat.type !== "private") {
      continue;
    }

    const label = [message.chat.first_name, message.chat.last_name].filter(Boolean).join(" ") || message.chat.username || message.chat.id;
    privateChats.set(message.chat.id, { label, updateId: update.update_id });
  }

  if (privateChats.size === 0) {
    return {
      ok: false,
      reason: "No private chat was found. Open the bot in Telegram, send /start or any message, then retry.",
    };
  }

  if (privateChats.size > 1) {
    const labels = Array.from(privateChats.values())
      .sort((left, right) => right.updateId - left.updateId)
      .map((entry) => entry.label)
      .join(", ");
    return {
      ok: false,
      reason: `Multiple private chats were found (${labels}). Enter the chat ID manually in Advanced options to avoid sending to the wrong person.`,
    };
  }

  return { ok: true, chatId: Array.from(privateChats.keys())[0] };
}
