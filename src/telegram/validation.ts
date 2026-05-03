import { z } from "zod";

import { telegramBotTokenSchema, telegramChatIdSchema } from "../security/validators";

const stringifiedIdSchema = z.coerce.string();

const telegramUserSchema = z.object({
  id: stringifiedIdSchema,
  is_bot: z.boolean(),
  first_name: z.string(),
  username: z.string().optional(),
});

const telegramChatSchema = z.object({
  id: stringifiedIdSchema,
  type: z.string(),
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});

const telegramMessageSchema = z.object({
  message_id: z.number(),
  date: z.number(),
  chat: telegramChatSchema,
  text: z.string().optional(),
});

const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: telegramMessageSchema.optional(),
  edited_message: telegramMessageSchema.optional(),
});

export const telegramGetMeResultSchema = telegramUserSchema.extend({
  can_join_groups: z.boolean().optional(),
  can_read_all_group_messages: z.boolean().optional(),
  supports_inline_queries: z.boolean().optional(),
});

export const telegramGetUpdatesResultSchema = z.array(telegramUpdateSchema);

export const telegramSendMessageResultSchema = telegramMessageSchema;

export const telegramSuccessEnvelopeSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    ok: z.literal(true),
    result: schema,
  });

export const telegramErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error_code: z.number().optional(),
  description: z.string().optional(),
});

export type TelegramGetMeResult = z.infer<typeof telegramGetMeResultSchema>;
export type TelegramGetUpdatesResult = z.infer<typeof telegramGetUpdatesResultSchema>;
export type TelegramSendMessageResult = z.infer<typeof telegramSendMessageResultSchema>;

export const telegramBotTokenInputSchema = telegramBotTokenSchema;
export const telegramChatIdInputSchema = telegramChatIdSchema;
