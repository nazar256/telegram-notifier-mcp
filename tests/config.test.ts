import { describe, expect, it } from "vitest";

import { getConfig, parseConfig } from "../src/config";
import { makeEnv } from "./helpers";

describe("config", () => {
  it("parses a valid environment", () => {
    const config = parseConfig(makeEnv());
    expect(config.oauthIssuer).toBe("https://example.com");
    expect(config.mcpResource).toBe("https://example.com/mcp");
    expect(config.scope).toBe("telegram.notify");
  });

  it("rejects missing keys", () => {
    const result = getConfig({});
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/OAUTH_ISSUER/i);
  });

  it("rejects invalid encryption key length", () => {
    const result = getConfig(
      makeEnv({
        UPSTREAM_CONFIG_ENC_KEY_B64: btoa("short"),
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/UPSTREAM_CONFIG_ENC_KEY_B64/);
  });
});
