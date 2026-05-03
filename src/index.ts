import { getConfig } from "./config";
import { handleMcpRequest } from "./mcp/server";
import { handleAuthorizeGet, handleAuthorizePost } from "./oauth/authorize";
import { createAuthorizationServerMetadata, createProtectedResourceMetadata } from "./oauth/metadata";
import { handleRegister } from "./oauth/register";
import { handleToken } from "./oauth/token";

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

function notFound(): Response {
  return json({ error: "not_found" }, 404);
}

function methodNotAllowed(allow: string): Response {
  return json({ error: "method_not_allowed" }, 405, { allow });
}

export interface WorkerEnv {
  [key: string]: string | undefined;
  ENVIRONMENT?: string;
  OAUTH_ISSUER?: string;
  MCP_RESOURCE?: string;
  MCP_AUDIENCE?: string;
  OAUTH_REDIRECT_HTTPS_HOSTS?: string;
  OAUTH_JWT_SIGNING_KEY_B64?: string;
  UPSTREAM_CONFIG_ENC_KEY_B64?: string;
  CSRF_SIGNING_KEY_B64?: string;
  ACCESS_TOKEN_TTL_SECONDS?: string;
  AUTH_CODE_TTL_SECONDS?: string;
}

async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const configResult = getConfig(env as Record<string, unknown>);

  if (url.pathname === "/health") {
    return json({ ok: configResult.ok, config_error: configResult.error ?? null });
  }

  if (!configResult.ok || !configResult.config) {
    return json({ error: "server_misconfigured", error_description: configResult.error }, 500);
  }

  const config = configResult.config;

  if (url.pathname === "/") {
    return json({
      name: "telegram-notifier-mcp",
      status: "ok",
      mcp_endpoint: `${config.oauthIssuer}/mcp`,
      authorization_server: config.oauthIssuer,
      resource: config.mcpResource,
    });
  }

  if (url.pathname === "/.well-known/oauth-authorization-server") {
    if (request.method !== "GET") {
      return methodNotAllowed("GET");
    }
    return json(createAuthorizationServerMetadata(config));
  }

  if (
    url.pathname === "/.well-known/oauth-protected-resource" ||
    url.pathname === "/.well-known/oauth-protected-resource/mcp"
  ) {
    if (request.method !== "GET") {
      return methodNotAllowed("GET");
    }
    return json(createProtectedResourceMetadata(config));
  }

  if (url.pathname === "/register") {
    if (request.method !== "POST") {
      return methodNotAllowed("POST");
    }
    return handleRegister(request, config);
  }

  if (url.pathname === "/authorize") {
    if (request.method === "GET") {
      return handleAuthorizeGet(request, config);
    }
    if (request.method === "POST") {
      return handleAuthorizePost(request, config);
    }
    return methodNotAllowed("GET, POST");
  }

  if (url.pathname === "/token") {
    if (request.method !== "POST") {
      return methodNotAllowed("POST");
    }
    return handleToken(request, config);
  }

  if (url.pathname === "/mcp") {
    if (!["GET", "POST", "DELETE"].includes(request.method)) {
      return methodNotAllowed("GET, POST, DELETE");
    }
    return handleMcpRequest(request, config);
  }

  return notFound();
}

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleRequest(request, env);
  },
};

export { handleRequest };
