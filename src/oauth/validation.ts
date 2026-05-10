import { z } from "zod";

import { ACCESS_TOKEN_TTL_PRESETS_DAYS, MAX_CUSTOM_ACCESS_TOKEN_TTL_DAYS } from "../config";

export const registerRequestSchema = z.object({
  redirect_uris: z.array(z.string().url()).length(1),
  client_name: z.string().optional(),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().optional(),
});

export const authorizeQuerySchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  state: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256"),
  resource: z.string().url().optional(),
  scope: z.string().optional(),
});

export const authorizeFormSchema = authorizeQuerySchema.extend({
  csrf_token: z.string().min(1),
  telegram_bot_token: z.string().optional().default(""),
  telegram_chat_id: z.string().optional(),
  send_test_message: z.union([z.literal("on"), z.literal("true")]).optional(),
  access_token_ttl_choice: z.enum(["30", "90", "365", "custom"]).optional().default("90"),
  custom_access_token_ttl_days: z.string().optional(),
});

export const authorizationCodeTokenRequestSchema = z.object({
  grant_type: z.literal("authorization_code"),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code: z.string().min(1),
  code_verifier: z.string().min(43).max(128),
  resource: z.string().url().optional(),
});

export const refreshTokenRequestSchema = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string().min(1),
  client_id: z.string().min(1),
  resource: z.string().url().optional(),
});

export const tokenRequestSchema = z.union([authorizationCodeTokenRequestSchema, refreshTokenRequestSchema]);

export function resolveRequestedAccessTokenTtlDays(input: {
  access_token_ttl_choice?: string;
  custom_access_token_ttl_days?: string;
}): number {
  const choice = input.access_token_ttl_choice ?? "90";
  if (choice !== "custom") {
    const days = Number.parseInt(choice, 10);
    if (!ACCESS_TOKEN_TTL_PRESETS_DAYS.includes(days as (typeof ACCESS_TOKEN_TTL_PRESETS_DAYS)[number])) {
      throw new Error("Unsupported access-token TTL preset");
    }
    return days;
  }

  const customDays = Number.parseInt(input.custom_access_token_ttl_days ?? "", 10);
  if (!Number.isInteger(customDays) || customDays < 1 || customDays > MAX_CUSTOM_ACCESS_TOKEN_TTL_DAYS) {
    throw new Error(`Custom access-token TTL must be between 1 and ${MAX_CUSTOM_ACCESS_TOKEN_TTL_DAYS} days`);
  }
  return customDays;
}

export function resolveRequestedAccessTokenTtlSeconds(
  input: {
    access_token_ttl_choice?: string;
    custom_access_token_ttl_days?: string;
  },
  maxSeconds: number,
): number {
  const requestedDays = resolveRequestedAccessTokenTtlDays(input);
  const requestedSeconds = requestedDays * 24 * 60 * 60;

  if (requestedSeconds > maxSeconds) {
    throw new Error(
      `Requested access-token duration exceeds the server maximum of ${Math.floor(maxSeconds / 86400)} days`,
    );
  }

  return requestedSeconds;
}
