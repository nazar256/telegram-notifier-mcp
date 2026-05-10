import { encryptJson, signJwt, stableJson } from "../src/security/crypto";
import type { WorkerEnv } from "../src/index";
import type { TelegramUserConfig } from "../src/oauth/authorize";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

function toBase64(bytes: Uint8Array): string {
  return bytesToBase64(bytes);
}

export function makeEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    ENVIRONMENT: "test",
    OAUTH_ISSUER: "https://example.com",
    MCP_RESOURCE: "https://example.com/mcp",
    MCP_AUDIENCE: "https://example.com/mcp",
    OAUTH_REDIRECT_HTTPS_HOSTS: "chatgpt.com,*.chatgpt.com,chat.openai.com,*.openai.com",
    OAUTH_JWT_SIGNING_KEY_B64: toBase64(new Uint8Array(32).fill(1)),
    UPSTREAM_CONFIG_ENC_KEY_B64: toBase64(new Uint8Array(32).fill(2)),
    CSRF_SIGNING_KEY_B64: toBase64(new Uint8Array(32).fill(3)),
    ACCESS_TOKEN_TTL_SECONDS: "7776000",
    AUTH_CODE_TTL_SECONDS: "120",
    ...overrides,
  };
}

export async function createAccessToken(env: WorkerEnv, userConfig?: Partial<TelegramUserConfig>): Promise<string> {
  const jwtSigningKey = base64ToBytes(env.OAUTH_JWT_SIGNING_KEY_B64!);
  const encKey = base64ToBytes(env.UPSTREAM_CONFIG_ENC_KEY_B64!);
  const issuer = env.OAUTH_ISSUER!;
  const audience = env.MCP_AUDIENCE!;
  const resource = env.MCP_RESOURCE!;
  const clientId = "tg-notify-test-client";
  const jwtId = crypto.randomUUID();
  const expiresInSeconds = 3600;
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;

  const enc = await encryptJson<TelegramUserConfig>(
    {
      telegram_bot_token: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd",
      telegram_chat_id: "42",
      telegram_bot_id: "999",
      telegram_bot_username: "notify_bot",
      ...userConfig,
    },
    encKey,
    stableJson({
      issuer,
      audience,
      resource,
      token_use: "access_token",
      client_id: clientId,
      exp,
      jti: jwtId,
      v: 1,
    }),
  );

  return signJwt({
    claims: {
      token_use: "access_token",
      client_id: clientId,
      scope: "telegram.notify",
      resource,
      enc,
    },
    key: jwtSigningKey,
    issuer,
    audience,
    expiresInSeconds,
    jwtId,
    typ: "access-token+jwt",
  });
}

export function createJsonRpcRequest(method: string, params: Record<string, unknown>, id = 1): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}
