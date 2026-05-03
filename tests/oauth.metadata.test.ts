import { describe, expect, it } from "vitest";

import { parseConfig } from "../src/config";
import { createAuthorizationServerMetadata, createProtectedResourceMetadata } from "../src/oauth/metadata";
import { makeEnv } from "./helpers";

describe("oauth metadata", () => {
  it("returns the expected authorization server metadata", () => {
    const config = parseConfig(makeEnv());
    const metadata = createAuthorizationServerMetadata(config);

    expect(metadata.issuer).toBe("https://example.com");
    expect(metadata.authorization_endpoint).toBe("https://example.com/authorize");
    expect(metadata.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
    expect(metadata.grant_types_supported).toEqual(["authorization_code"]);
  });

  it("returns the expected protected resource metadata", () => {
    const config = parseConfig(makeEnv());
    const metadata = createProtectedResourceMetadata(config);

    expect(metadata.resource).toBe("https://example.com/mcp");
    expect(metadata.authorization_servers).toEqual(["https://example.com"]);
    expect(metadata.scopes_supported).toEqual(["telegram.notify"]);
  });
});
