import { z } from "zod";

const rawEnvSchema = z.object({
  ENVIRONMENT: z.enum(["development", "production", "test"]).default("production"),
  OAUTH_ISSUER: z.string().min(1),
  MCP_RESOURCE: z.string().min(1),
  MCP_AUDIENCE: z.string().min(1),
  OAUTH_REDIRECT_HTTPS_HOSTS: z.string().min(1),
  OAUTH_JWT_SIGNING_KEY_B64: z.string().min(1),
  UPSTREAM_CONFIG_ENC_KEY_B64: z.string().min(1),
  CSRF_SIGNING_KEY_B64: z.string().min(1),
  ACCESS_TOKEN_TTL_SECONDS: z.string().optional().default("31536000"),
  AUTH_CODE_TTL_SECONDS: z.string().optional().default("120"),
});

export const OAUTH_SCOPE = "telegram.notify";
export const ACCESS_TOKEN_TTL_PRESETS_DAYS = [30, 90, 365] as const;
export const MAX_CUSTOM_ACCESS_TOKEN_TTL_DAYS = 3650;

export interface AppConfig {
  environment: "development" | "production" | "test";
  isDevelopment: boolean;
  oauthIssuer: string;
  mcpResource: string;
  mcpAudience: string;
  redirectHttpsHosts: string[];
  jwtSigningKey: Uint8Array;
  upstreamConfigEncKey: Uint8Array;
  csrfSigningKey: Uint8Array;
  accessTokenTtlSeconds: number;
  authCodeTtlSeconds: number;
  scope: typeof OAUTH_SCOPE;
}

export interface ConfigResult {
  ok: boolean;
  config?: AppConfig;
  error?: string;
}

function decodeBase64ToBytes(input: string): Uint8Array {
  const normalized = input.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);

  if (typeof atob === "function") {
    const decoded = atob(padded);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }
    return bytes;
  }

  throw new Error("Base64 decoding is unavailable in this runtime");
}

function parseUrl(value: string, label: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} must be a valid absolute URL`);
  }
}

function parseTtl(value: string, label: string, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function validateKeyLength(bytes: Uint8Array, label: string, lengths: number[]): void {
  if (!lengths.includes(bytes.byteLength)) {
    const allowed = lengths.join("/");
    throw new Error(`${label} must decode to ${allowed} bytes`);
  }
}

function validateMinimumKeyLength(bytes: Uint8Array, label: string, minBytes: number): void {
  if (bytes.byteLength < minBytes) {
    throw new Error(`${label} must decode to at least ${minBytes} bytes`);
  }
}

export function parseConfig(env: Record<string, unknown>): AppConfig {
  const parsed = rawEnvSchema.parse(env);
  const environment = parsed.ENVIRONMENT;
  const isDevelopment = environment !== "production";

  const oauthIssuer = parseUrl(parsed.OAUTH_ISSUER, "OAUTH_ISSUER");
  const mcpResource = parseUrl(parsed.MCP_RESOURCE, "MCP_RESOURCE");
  const mcpAudience = parseUrl(parsed.MCP_AUDIENCE, "MCP_AUDIENCE");

  if (!isDevelopment && oauthIssuer.protocol !== "https:") {
    throw new Error("OAUTH_ISSUER must be https in production");
  }

  if (!isDevelopment && mcpResource.protocol !== "https:") {
    throw new Error("MCP_RESOURCE must be https in production");
  }

  if (!isDevelopment && mcpAudience.protocol !== "https:") {
    throw new Error("MCP_AUDIENCE must be https in production");
  }

  const jwtSigningKey = decodeBase64ToBytes(parsed.OAUTH_JWT_SIGNING_KEY_B64);
  const upstreamConfigEncKey = decodeBase64ToBytes(parsed.UPSTREAM_CONFIG_ENC_KEY_B64);
  const csrfSigningKey = decodeBase64ToBytes(parsed.CSRF_SIGNING_KEY_B64);

  validateMinimumKeyLength(jwtSigningKey, "OAUTH_JWT_SIGNING_KEY_B64", 32);
  validateKeyLength(upstreamConfigEncKey, "UPSTREAM_CONFIG_ENC_KEY_B64", [16, 24, 32]);
  validateMinimumKeyLength(csrfSigningKey, "CSRF_SIGNING_KEY_B64", 32);

  return {
    environment,
    isDevelopment,
    oauthIssuer: oauthIssuer.toString().replace(/\/$/, ""),
    mcpResource: mcpResource.toString(),
    mcpAudience: mcpAudience.toString(),
    redirectHttpsHosts: parsed.OAUTH_REDIRECT_HTTPS_HOSTS.split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    jwtSigningKey,
    upstreamConfigEncKey,
    csrfSigningKey,
    accessTokenTtlSeconds: parseTtl(parsed.ACCESS_TOKEN_TTL_SECONDS, "ACCESS_TOKEN_TTL_SECONDS", 86400, 315360000),
    authCodeTtlSeconds: parseTtl(parsed.AUTH_CODE_TTL_SECONDS, "AUTH_CODE_TTL_SECONDS", 60, 300),
    scope: OAUTH_SCOPE,
  };
}

export function getConfig(env: Record<string, unknown>): ConfigResult {
  try {
    return { ok: true, config: parseConfig(env) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown configuration error",
    };
  }
}
