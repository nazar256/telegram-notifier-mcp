import { z } from "zod";

import { AppConfig, OAUTH_SCOPE } from "../config";
import { sha256Base64Url } from "./crypto";

export const telegramBotTokenSchema = z
  .string()
  .trim()
  .regex(/^\d{6,}:[A-Za-z0-9_-]{20,}$/, "Enter a valid Telegram bot token from BotFather");

export const telegramChatIdSchema = z
  .string()
  .trim()
  .regex(/^-?\d{1,20}$/, "Chat ID must be an integer string");

export const toolMessageSchema = z.object({
  message: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, "Message must not be empty")
    .refine((value) => value.length <= 3500, "Message must be 3500 characters or less"),
  disable_notification: z.boolean().optional().default(false),
});

function isAllowedHttpsHost(host: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(2);
      return host === suffix || host.endsWith(`.${suffix}`);
    }
    return host === pattern;
  });
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function isLoopbackRedirectUri(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    return url.protocol === "http:" && isLoopbackHostname(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isAllowedRedirectUri(redirectUri: string, config: AppConfig): boolean {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  if (url.protocol === "https:") {
    return isAllowedHttpsHost(hostname, config.redirectHttpsHosts);
  }

  if (url.protocol === "http:" && isLoopbackHostname(hostname)) {
    return true;
  }

  return false;
}

export function normalizeScope(scope?: string): string {
  if (!scope || !scope.trim()) {
    return OAUTH_SCOPE;
  }

  const values = Array.from(new Set(scope.split(/\s+/).filter(Boolean)));
  if (values.length !== 1 || values[0] !== OAUTH_SCOPE) {
    throw new Error(`Only the ${OAUTH_SCOPE} scope is supported`);
  }

  return OAUTH_SCOPE;
}

export function validateRequestedResource(resource: string | undefined, config: AppConfig): string {
  if (!resource) {
    return config.mcpResource;
  }

  if (resource !== config.mcpResource) {
    throw new Error("Requested resource is not supported");
  }

  return resource;
}

export async function deriveClientId(redirectUri: string, issuer: string): Promise<string> {
  const canonical = JSON.stringify({
    version: 1,
    issuer,
    redirect_uri: redirectUri,
    response_types: ["code"],
    grant_types: ["authorization_code"],
    token_endpoint_auth_method: "none",
  });
  const digest = await sha256Base64Url(canonical);
  return `tg-notify-${digest}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
