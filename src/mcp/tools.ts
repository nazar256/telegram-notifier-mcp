import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { toolMessageSchema } from "../security/validators";
import { TelegramApiError, type TelegramClient } from "../telegram/client";

export interface BoundTelegramConfig {
  botToken: string;
  chatId: string;
}

export function registerTelegramTools(server: McpServer, telegramClient: TelegramClient, config: BoundTelegramConfig): void {
  server.registerTool(
    "send_telegram_notification",
    {
      title: "Send Telegram notification",
      description: "Send a short text notification to the Telegram chat configured during authorization.",
      inputSchema: {
        message: z.string().min(1).max(3500).describe("Notification text to send to Telegram."),
        disable_notification: z.boolean().optional().describe("If true, deliver the message silently."),
      },
    },
    async (input) => {
      const parsed = toolMessageSchema.safeParse(input);
      if (!parsed.success) {
        return {
          isError: true,
          content: [{ type: "text", text: parsed.error.issues[0]?.message ?? "Invalid tool input." }],
        };
      }

      try {
        const result = await telegramClient.sendMessage(
          config.botToken,
          config.chatId,
          parsed.data.message,
          { disable_notification: parsed.data.disable_notification },
        );
        return {
          content: [
            {
              type: "text",
              text: `Notification sent successfully (message_id: ${result.message_id}).`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof TelegramApiError ? error.message : "Telegram send failed.";
        return {
          isError: true,
          content: [{ type: "text", text: message }],
        };
      }
    },
  );
}
