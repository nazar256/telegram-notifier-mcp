import { z } from "zod";
import type { JWTPayload } from "jose";

import { AppConfig } from "../config";
import { createCsrfToken, verifyCsrfToken, type CsrfPayload } from "../security/csrf";
import { decryptJson, encryptJson, signJwt, stableJson } from "../security/crypto";
import { toSafeErrorMessage } from "../security/redact";
import {
  deriveClientId,
  escapeHtml,
  isAllowedRedirectUri,
  normalizeScope,
  telegramBotTokenSchema,
  telegramChatIdSchema,
  validateRequestedResource,
} from "../security/validators";
import { createTelegramClient, resolvePrivateChatId, TelegramApiError } from "../telegram/client";
import { authorizeFormSchema, authorizeQuerySchema, resolveRequestedAccessTokenTtlSeconds } from "./validation";

export interface TelegramUserConfig {
  telegram_bot_token: string;
  telegram_chat_id: string;
  telegram_bot_username?: string;
  telegram_bot_id?: string;
}

export interface AuthCodeClaims extends JWTPayload {
  token_use: "auth_code";
  client_id: string;
  redirect_uri: string;
  scope: string;
  resource: string;
  code_challenge: string;
  code_challenge_method: "S256";
  enc: Awaited<ReturnType<typeof encryptJson<TelegramUserConfig>>>;
  access_ttl_seconds: number;
}

interface RenderPageOptions {
  oauth: z.infer<typeof authorizeQuerySchema>;
  csrfToken: string;
  error?: string;
  manualChatId?: string;
  ttlChoice?: string;
  customTtlDays?: string;
  sendTestMessage?: boolean;
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "content-security-policy": [
        "default-src 'none'",
        "style-src 'unsafe-inline'",
        "form-action 'self'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
    },
  });
}

function redirect(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      location: url,
      "cache-control": "no-store, max-age=0",
      pragma: "no-cache",
    },
  });
}

function renderAuthorizePage(options: RenderPageOptions): string {
  const errorBlock = options.error
    ? `<p style="padding:12px;border:1px solid #f5c2c7;background:#fff5f5;color:#842029;border-radius:8px;">${escapeHtml(options.error)}</p>`
    : "";

  const checked = options.sendTestMessage ? "checked" : "";
  const selectedTtlChoice = options.ttlChoice ?? "90";
  const customVisible = selectedTtlChoice === "custom";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Connect Telegram notification MCP</title>
  </head>
  <body style="font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; line-height: 1.5; color: #111827;">
    <h1>Connect Telegram notification MCP</h1>
    <p>This server sends Telegram notifications using your own bot token.</p>
    <ol>
      <li>Create a Telegram bot with <strong>@BotFather</strong>.</li>
      <li>Copy the bot token.</li>
      <li>Open the bot chat in Telegram and send <code>/start</code> or any message so this gateway can discover your private chat ID.</li>
      <li>Paste the token below. The token is encrypted into the OAuth credential and is not stored server-side.</li>
    </ol>
    ${errorBlock}
    <form method="post" action="/authorize">
      <input type="hidden" name="response_type" value="${escapeHtml(options.oauth.response_type)}" />
      <input type="hidden" name="client_id" value="${escapeHtml(options.oauth.client_id)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(options.oauth.redirect_uri)}" />
      <input type="hidden" name="state" value="${escapeHtml(options.oauth.state ?? "")}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(options.oauth.code_challenge)}" />
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(options.oauth.code_challenge_method)}" />
      <input type="hidden" name="resource" value="${escapeHtml(options.oauth.resource ?? "")}" />
      <input type="hidden" name="scope" value="${escapeHtml(options.oauth.scope ?? "")}" />
      <input type="hidden" name="csrf_token" value="${escapeHtml(options.csrfToken)}" />

      <label for="telegram_bot_token"><strong>Telegram bot token</strong></label>
      <input id="telegram_bot_token" name="telegram_bot_token" type="password" autocomplete="off" required style="display:block;width:100%;padding:12px;margin:8px 0 16px 0;box-sizing:border-box;" />

      <label for="access_token_ttl_choice"><strong>Access-token duration</strong></label>
      <select id="access_token_ttl_choice" name="access_token_ttl_choice" style="display:block;width:100%;padding:12px;margin:8px 0 12px 0;box-sizing:border-box;">
        <option value="30" ${selectedTtlChoice === "30" ? "selected" : ""}>30 days</option>
        <option value="90" ${selectedTtlChoice === "90" ? "selected" : ""}>90 days</option>
        <option value="365" ${selectedTtlChoice === "365" ? "selected" : ""}>365 days</option>
        <option value="custom" ${customVisible ? "selected" : ""}>Custom</option>
      </select>

      <label for="custom_access_token_ttl_days"><strong>Custom days</strong></label>
      <input id="custom_access_token_ttl_days" name="custom_access_token_ttl_days" type="number" min="1" max="365" value="${escapeHtml(options.customTtlDays ?? "")}" style="display:block;width:100%;padding:12px;margin:8px 0 16px 0;box-sizing:border-box;" />

      <label style="display:block;margin:0 0 16px 0;">
        <input type="checkbox" name="send_test_message" value="on" ${checked} />
        Send a small test message after successful validation.
      </label>

      <details style="margin-bottom:16px;">
        <summary>Advanced: enter chat ID manually</summary>
        <label for="telegram_chat_id" style="display:block;margin-top:12px;"><strong>Telegram chat ID</strong></label>
        <input id="telegram_chat_id" name="telegram_chat_id" type="text" value="${escapeHtml(options.manualChatId ?? "")}" style="display:block;width:100%;padding:12px;margin:8px 0 0 0;box-sizing:border-box;" />
      </details>

      <button type="submit" style="padding:12px 18px;border:0;border-radius:8px;background:#111827;color:#fff;cursor:pointer;">Authorize</button>
    </form>
  </body>
</html>`;
}

async function buildCsrfPayload(oauth: z.infer<typeof authorizeQuerySchema>, scope: string, resource: string): Promise<CsrfPayload> {
  return {
    csrf_kind: "authorize",
    state: oauth.state,
    client_id: oauth.client_id,
    redirect_uri: oauth.redirect_uri,
    code_challenge: oauth.code_challenge,
    code_challenge_method: oauth.code_challenge_method,
    scope,
    resource,
  };
}

async function renderAuthorizeForm(
  oauth: z.infer<typeof authorizeQuerySchema>,
  config: AppConfig,
  options: Omit<RenderPageOptions, "oauth" | "csrfToken">,
): Promise<Response> {
  const scope = normalizeScope(oauth.scope);
  const resource = validateRequestedResource(oauth.resource, config);
  const csrfPayload = await buildCsrfPayload(oauth, scope, resource);
  const csrfToken = await createCsrfToken({
    payload: csrfPayload,
    key: config.csrfSigningKey,
    issuer: config.oauthIssuer,
  });

  return html(
    renderAuthorizePage({
      oauth,
      csrfToken,
      ...options,
    }),
    options.error ? 400 : 200,
  );
}

export async function handleAuthorizeGet(request: Request, config: AppConfig): Promise<Response> {
  const rawParams = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = authorizeQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return html(`<p>${escapeHtml(parsed.error.issues[0]?.message ?? "Invalid OAuth request")}</p>`, 400);
  }

  const oauth = parsed.data;
  const derivedClientId = await deriveClientId(oauth.redirect_uri, config.oauthIssuer);
  if (oauth.client_id !== derivedClientId) {
    return html("<p>Client ID does not match the registered redirect URI.</p>", 400);
  }
  if (!isAllowedRedirectUri(oauth.redirect_uri, config)) {
    return html("<p>Redirect URI is not allowed.</p>", 400);
  }

  try {
    normalizeScope(oauth.scope);
    validateRequestedResource(oauth.resource, config);
  } catch (error) {
    return html(`<p>${escapeHtml(error instanceof Error ? error.message : "Invalid authorization request")}</p>`, 400);
  }

  return renderAuthorizeForm(oauth, config, {});
}

export async function handleAuthorizePost(request: Request, config: AppConfig): Promise<Response> {
  const formData = await request.formData();
  const rawForm = Object.fromEntries(formData.entries());
  const parsed = authorizeFormSchema.safeParse(rawForm);
  if (!parsed.success) {
    const fallbackOauth = authorizeQuerySchema.safeParse(rawForm);
    if (fallbackOauth.success) {
      return renderAuthorizeForm(fallbackOauth.data, config, {
        error: parsed.error.issues[0]?.message ?? "Invalid form submission",
      });
    }
    return html("<p>Invalid authorization form submission.</p>", 400);
  }

  const form = parsed.data;
  const oauth = authorizeQuerySchema.parse(form);
  const derivedClientId = await deriveClientId(oauth.redirect_uri, config.oauthIssuer);
  if (oauth.client_id !== derivedClientId) {
    return renderAuthorizeForm(oauth, config, { error: "Client ID does not match the registered redirect URI." });
  }
  if (!isAllowedRedirectUri(oauth.redirect_uri, config)) {
    return renderAuthorizeForm(oauth, config, { error: "Redirect URI is not allowed." });
  }

  let scope: string;
  let resource: string;
  try {
    scope = normalizeScope(oauth.scope);
    resource = validateRequestedResource(oauth.resource, config);
  } catch (error) {
    return renderAuthorizeForm(oauth, config, { error: error instanceof Error ? error.message : "Invalid OAuth parameters." });
  }

  const csrfOk = await verifyCsrfToken({
    token: form.csrf_token,
    key: config.csrfSigningKey,
    issuer: config.oauthIssuer,
    expected: await buildCsrfPayload(oauth, scope, resource),
  }).catch(() => false);

  if (!csrfOk) {
    return renderAuthorizeForm(oauth, config, { error: "The authorization form expired or failed CSRF validation. Please retry." });
  }

  const botTokenResult = telegramBotTokenSchema.safeParse(form.telegram_bot_token ?? "");
  if (!botTokenResult.success) {
    return renderAuthorizeForm(oauth, config, {
      error: botTokenResult.error.issues[0]?.message ?? "Enter a valid Telegram bot token.",
      manualChatId: form.telegram_chat_id,
      ttlChoice: form.access_token_ttl_choice,
      customTtlDays: form.custom_access_token_ttl_days,
      sendTestMessage: Boolean(form.send_test_message),
    });
  }

  let accessTokenTtlSeconds: number;
  try {
    accessTokenTtlSeconds = resolveRequestedAccessTokenTtlSeconds(form, config.accessTokenTtlSeconds);
  } catch (error) {
    return renderAuthorizeForm(oauth, config, {
      error: error instanceof Error ? error.message : "Invalid access-token duration.",
      manualChatId: form.telegram_chat_id,
      ttlChoice: form.access_token_ttl_choice,
      customTtlDays: form.custom_access_token_ttl_days,
      sendTestMessage: Boolean(form.send_test_message),
    });
  }

  const telegramClient = createTelegramClient();
  const botToken = botTokenResult.data;

  try {
    const me = await telegramClient.getMe(botToken);
    let chatId: string;

    if (form.telegram_chat_id && form.telegram_chat_id.trim()) {
      const manualChatId = telegramChatIdSchema.safeParse(form.telegram_chat_id);
      if (!manualChatId.success) {
        return renderAuthorizeForm(oauth, config, {
          error: manualChatId.error.issues[0]?.message ?? "Invalid manual chat ID.",
          manualChatId: form.telegram_chat_id,
          ttlChoice: form.access_token_ttl_choice,
          customTtlDays: form.custom_access_token_ttl_days,
          sendTestMessage: Boolean(form.send_test_message),
        });
      }
      chatId = manualChatId.data;
    } else {
      const updates = await telegramClient.getUpdates(botToken);
      const resolution = resolvePrivateChatId(updates);
      if (!resolution.ok) {
        return renderAuthorizeForm(oauth, config, {
          error: resolution.reason,
          ttlChoice: form.access_token_ttl_choice,
          customTtlDays: form.custom_access_token_ttl_days,
          sendTestMessage: Boolean(form.send_test_message),
        });
      }
      chatId = resolution.chatId;
    }

    if (form.send_test_message) {
      await telegramClient.sendMessage(
        botToken,
        chatId,
        "✅ Telegram notification MCP connection validated successfully.",
      );
    }

    const jwtId = crypto.randomUUID();
    const expirationEpochSeconds = Math.floor(Date.now() / 1000) + config.authCodeTtlSeconds;
    const claimsWithoutEnvelope = {
      token_use: "auth_code" as const,
      client_id: oauth.client_id,
      redirect_uri: oauth.redirect_uri,
      scope,
      resource,
      code_challenge: oauth.code_challenge,
      code_challenge_method: oauth.code_challenge_method,
      access_ttl_seconds: accessTokenTtlSeconds,
    };

    const enc = await encryptJson<TelegramUserConfig>(
      {
        telegram_bot_token: botToken,
        telegram_chat_id: chatId,
        telegram_bot_username: me.username,
        telegram_bot_id: me.id,
      },
      config.upstreamConfigEncKey,
      stableJson({
        issuer: config.oauthIssuer,
        audience: config.mcpAudience,
        resource,
        token_use: claimsWithoutEnvelope.token_use,
        client_id: oauth.client_id,
        redirect_uri: oauth.redirect_uri,
        exp: expirationEpochSeconds,
        jti: jwtId,
        v: 1,
      }),
    );

    const code = await signJwt<AuthCodeClaims>({
      claims: {
        ...claimsWithoutEnvelope,
        enc,
      },
      key: config.jwtSigningKey,
      issuer: config.oauthIssuer,
      audience: config.mcpAudience,
      expiresInSeconds: config.authCodeTtlSeconds,
      jwtId,
      typ: "oauth-auth-code+jwt",
    });

    const redirectUrl = new URL(oauth.redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (oauth.state) {
      redirectUrl.searchParams.set("state", oauth.state);
    }
    return redirect(redirectUrl.toString());
  } catch (error) {
    const message =
      error instanceof TelegramApiError
        ? error.message
        : `Authorization failed: ${toSafeErrorMessage(error)}`;
    return renderAuthorizeForm(oauth, config, {
      error: message,
      manualChatId: form.telegram_chat_id,
      ttlChoice: form.access_token_ttl_choice,
      customTtlDays: form.custom_access_token_ttl_days,
      sendTestMessage: Boolean(form.send_test_message),
    });
  }
}
