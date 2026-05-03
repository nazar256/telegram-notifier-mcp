import { z } from "zod";
import type { JWTPayload } from "jose";

import { AppConfig } from "../config";
import { decryptJson, encryptJson, signJwt, stableJson, verifyJwt } from "../security/crypto";
import { toSafeErrorMessage } from "../security/redact";
import { deriveClientId, validateRequestedResource } from "../security/validators";
import { verifyPkceS256 } from "./pkce";
import { tokenRequestSchema } from "./validation";
import type { AuthCodeClaims, TelegramUserConfig } from "./authorize";

interface AccessTokenClaims extends JWTPayload {
  token_use: "access_token";
  client_id: string;
  scope: string;
  resource: string;
  enc: Awaited<ReturnType<typeof encryptJson<TelegramUserConfig>>>;
}

function oauthJson(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      pragma: "no-cache",
    },
  });
}

function oauthError(error: string, description: string, status = 400): Response {
  return oauthJson({ error, error_description: description }, status);
}

async function parseTokenRequest(request: Request): Promise<z.infer<typeof tokenRequestSchema>> {
  const contentType = request.headers.get("content-type") ?? "";
  let raw: Record<string, unknown>;

  if (contentType.includes("application/json")) {
    raw = (await request.json()) as Record<string, unknown>;
  } else {
    const form = await request.formData();
    raw = Object.fromEntries(form.entries());
  }

  return tokenRequestSchema.parse(raw);
}

export async function handleToken(request: Request, config: AppConfig): Promise<Response> {
  let parsed: z.infer<typeof tokenRequestSchema>;
  try {
    parsed = await parseTokenRequest(request);
  } catch (error) {
    return oauthError("invalid_request", error instanceof Error ? error.message : "Invalid token request");
  }

  if (parsed.grant_type === "refresh_token") {
    return oauthError("unsupported_grant_type", "Refresh tokens are not implemented in this stateless v1 server.");
  }

  let resource: string;
  try {
    resource = validateRequestedResource(parsed.resource, config);
  } catch (error) {
    return oauthError("invalid_target", error instanceof Error ? error.message : "Unsupported resource");
  }

  const expectedClientId = await deriveClientId(parsed.redirect_uri, config.oauthIssuer);
  if (parsed.client_id !== expectedClientId) {
    return oauthError("invalid_client", "Client ID does not match the redirect URI.");
  }

  let verifiedCode: AuthCodeClaims & { jti?: string; exp?: number };
  try {
    const verified = await verifyJwt<AuthCodeClaims & { jti?: string; exp?: number }>({
      token: parsed.code,
      key: config.jwtSigningKey,
      issuer: config.oauthIssuer,
      audience: config.mcpAudience,
      typ: "oauth-auth-code+jwt",
    });
    verifiedCode = verified.payload;
  } catch (error) {
    return oauthError("invalid_grant", `Authorization code validation failed: ${toSafeErrorMessage(error)}`);
  }

  if (verifiedCode.token_use !== "auth_code") {
    return oauthError("invalid_grant", "Authorization code has the wrong token type.");
  }
  if (verifiedCode.client_id !== parsed.client_id || verifiedCode.redirect_uri !== parsed.redirect_uri) {
    return oauthError("invalid_grant", "Authorization code does not match the client or redirect URI.");
  }
  if (verifiedCode.resource !== resource) {
    return oauthError("invalid_target", "Requested resource does not match the authorization code.");
  }

  const pkceValid = await verifyPkceS256(parsed.code_verifier, verifiedCode.code_challenge);
  if (!pkceValid) {
    return oauthError("invalid_grant", "PKCE verification failed.");
  }

  try {
    const userConfig = await decryptJson<TelegramUserConfig>(
      verifiedCode.enc,
      config.upstreamConfigEncKey,
      stableJson({
        issuer: config.oauthIssuer,
        audience: config.mcpAudience,
        resource: verifiedCode.resource,
        token_use: verifiedCode.token_use,
        client_id: verifiedCode.client_id,
        redirect_uri: verifiedCode.redirect_uri,
        exp: verifiedCode.exp,
        jti: verifiedCode.jti,
        v: 1,
      }),
    );

    const jwtId = crypto.randomUUID();
    const expirationEpochSeconds = Math.floor(Date.now() / 1000) + verifiedCode.access_ttl_seconds;
    const accessTokenClaims = {
      token_use: "access_token" as const,
      client_id: parsed.client_id,
      scope: verifiedCode.scope,
      resource,
    };

    const enc = await encryptJson(userConfig, config.upstreamConfigEncKey, stableJson({
      issuer: config.oauthIssuer,
      audience: config.mcpAudience,
      resource,
      token_use: accessTokenClaims.token_use,
      client_id: parsed.client_id,
      exp: expirationEpochSeconds,
      jti: jwtId,
      v: 1,
    }));

    const accessToken = await signJwt<AccessTokenClaims>({
      claims: {
        ...accessTokenClaims,
        enc,
      },
      key: config.jwtSigningKey,
      issuer: config.oauthIssuer,
      audience: config.mcpAudience,
      expiresInSeconds: verifiedCode.access_ttl_seconds,
      jwtId,
      typ: "access-token+jwt",
    });

    return oauthJson({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: verifiedCode.access_ttl_seconds,
      scope: verifiedCode.scope,
      resource,
    });
  } catch (error) {
    return oauthError("invalid_grant", `Could not issue access token: ${toSafeErrorMessage(error)}`);
  }
}
