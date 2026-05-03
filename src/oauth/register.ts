import { AppConfig } from "../config";
import { isAllowedRedirectUri, isLoopbackRedirectUri, normalizeScope, deriveClientId } from "../security/validators";
import { registerRequestSchema } from "./validation";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleRegister(request: Request, config: AppConfig): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_client_metadata", error_description: "Registration body must be valid JSON" }, 400);
  }

  const parsed = registerRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: "invalid_client_metadata", error_description: parsed.error.issues[0]?.message ?? "Invalid registration metadata" }, 400);
  }

  const redirectUri = parsed.data.redirect_uris[0];
  if (!isAllowedRedirectUri(redirectUri, config)) {
    return json({ error: "invalid_redirect_uri", error_description: "Redirect URI is not allowed" }, 400);
  }

  if (parsed.data.token_endpoint_auth_method && parsed.data.token_endpoint_auth_method !== "none") {
    return json({ error: "invalid_client_metadata", error_description: "Only public clients with token_endpoint_auth_method=none are supported" }, 400);
  }

  try {
    normalizeScope(parsed.data.scope);
  } catch (error) {
    return json({ error: "invalid_client_metadata", error_description: error instanceof Error ? error.message : "Invalid scope" }, 400);
  }

  const clientId = await deriveClientId(redirectUri, config.oauthIssuer);
  return json({
    client_id: clientId,
    application_type: isLoopbackRedirectUri(redirectUri) ? "native" : "web",
    grant_types: ["authorization_code"],
    response_types: ["code"],
    redirect_uris: [redirectUri],
    token_endpoint_auth_method: "none",
    scope: config.scope,
  });
}
