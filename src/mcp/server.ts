import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { JWTPayload } from "jose";

import { AppConfig } from "../config";
import { decryptJson, stableJson, verifyJwt } from "../security/crypto";
import { toSafeErrorMessage } from "../security/redact";
import { createTelegramClient } from "../telegram/client";
import { registerTelegramTools } from "./tools";
import type { TelegramUserConfig } from "../oauth/authorize";

interface AccessTokenClaims extends JWTPayload {
  token_use: "access_token";
  client_id: string;
  scope: string;
  resource: string;
  enc: {
    v: 1;
    iv: string;
    ct: string;
    kid?: string;
  };
  exp?: number;
  jti?: string;
}

function unauthorized(config: AppConfig, errorDescription?: string): Response {
  const header = [
    `Bearer realm="${config.oauthIssuer}"`,
    'error="invalid_token"',
    `resource_metadata="${config.oauthIssuer}/.well-known/oauth-protected-resource"`,
    `scope="${config.scope}"`,
  ];
  if (errorDescription) {
    header.push(`error_description="${errorDescription.replace(/"/g, "'")}"`);
  }

  return new Response(JSON.stringify({ error: "invalid_token", error_description: errorDescription ?? "Bearer token required" }, null, 2), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": header.join(", "),
    },
  });
}

function extractBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return undefined;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

async function authenticateMcpRequest(request: Request, config: AppConfig): Promise<
  | { ok: true; userConfig: TelegramUserConfig }
  | { ok: false; response: Response }
> {
  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false, response: unauthorized(config) };
  }

  let payload: AccessTokenClaims;
  try {
    const verified = await verifyJwt<AccessTokenClaims>({
      token,
      key: config.jwtSigningKey,
      issuer: config.oauthIssuer,
      audience: config.mcpAudience,
      typ: "access-token+jwt",
    });
    payload = verified.payload;
  } catch (error) {
    return { ok: false, response: unauthorized(config, toSafeErrorMessage(error)) };
  }

  if (payload.token_use !== "access_token") {
    return { ok: false, response: unauthorized(config, "Token type is invalid") };
  }
  if (payload.scope !== config.scope) {
    return { ok: false, response: unauthorized(config, "Token scope is invalid") };
  }
  if (payload.resource !== config.mcpResource) {
    return { ok: false, response: unauthorized(config, "Token resource is invalid") };
  }

  try {
    const userConfig = await decryptJson<TelegramUserConfig>(
      payload.enc,
      config.upstreamConfigEncKey,
      stableJson({
        issuer: config.oauthIssuer,
        audience: config.mcpAudience,
        resource: payload.resource,
        token_use: payload.token_use,
        client_id: payload.client_id,
        exp: payload.exp,
        jti: payload.jti,
        v: 1,
      }),
    );
    return { ok: true, userConfig };
  } catch (error) {
    return { ok: false, response: unauthorized(config, `Could not decrypt token config: ${toSafeErrorMessage(error)}`) };
  }
}

export async function handleMcpRequest(request: Request, config: AppConfig): Promise<Response> {
  const authenticated = await authenticateMcpRequest(request, config);
  if (!authenticated.ok) {
    return authenticated.response;
  }

  const server = new McpServer({
    name: "telegram-notifier-mcp",
    version: "0.1.0",
  });
  const telegramClient = createTelegramClient();
  registerTelegramTools(server, telegramClient, {
    botToken: authenticated.userConfig.telegram_bot_token,
    chatId: authenticated.userConfig.telegram_chat_id,
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  let cleanedUp = false;
  const onAbort = (): void => {
    void cleanup();
  };
  const cleanup = async (): Promise<void> => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    request.signal.removeEventListener("abort", onAbort);
    await server.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  };

  // For streaming responses (SSE), the response body can continue producing bytes
  // after this function returns. We tie cleanup to client disconnect.
  request.signal.addEventListener("abort", onAbort);

  const wrapBodyWithCleanup = (response: Response): Response => {
    const originalBody = response.body;
    if (!originalBody) {
      return response;
    }

    const reader = originalBody.getReader();

    const wrapped = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            await cleanup();
            controller.close();
            return;
          }
          controller.enqueue(value);
        } catch (error) {
          await cleanup();
          controller.error(error);
        }
      },
      async cancel(reason) {
        await cleanup();
        await reader.cancel(reason).catch(() => undefined);
      },
    });

    return new Response(wrapped, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });
  };

  try {
    const response = await transport.handleRequest(request);
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      return wrapBodyWithCleanup(response);
    }

    const cloned = response.clone();
    const body = await cloned.arrayBuffer();
    await cleanup();
    return new Response(body, { status: response.status, headers: response.headers });
  } catch (error) {
    await cleanup();
    throw error;
  }
}
