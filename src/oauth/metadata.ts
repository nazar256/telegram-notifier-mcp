import { AppConfig } from "../config";

export function createAuthorizationServerMetadata(config: AppConfig) {
  return {
    issuer: config.oauthIssuer,
    authorization_endpoint: `${config.oauthIssuer}/authorize`,
    token_endpoint: `${config.oauthIssuer}/token`,
    registration_endpoint: `${config.oauthIssuer}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [config.scope],
    resource_parameter_supported: true,
  };
}

export function createProtectedResourceMetadata(config: AppConfig) {
  return {
    resource: config.mcpResource,
    authorization_servers: [config.oauthIssuer],
    scopes_supported: [config.scope],
    bearer_methods_supported: ["header"],
    resource_name: "Telegram notification MCP gateway",
  };
}
