import { describe, expect, it } from "vitest";

import { verifyPkceS256 } from "../src/oauth/pkce";
import { createCsrfToken, verifyCsrfToken } from "../src/security/csrf";
import { decryptJson, encryptJson, sha256Base64Url, signJwt, stableJson, verifyJwt } from "../src/security/crypto";

describe("security primitives", () => {
  it("verifies PKCE S256 correctly", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await sha256Base64Url(verifier);
    await expect(verifyPkceS256(verifier, challenge)).resolves.toBe(true);
    await expect(verifyPkceS256("wrong", challenge)).resolves.toBe(false);
  });

  it("encrypts and decrypts JSON with AAD", async () => {
    const key = new Uint8Array(32).fill(9);
    const aad = stableJson({ issuer: "x", aud: "y", typ: "z" });
    const envelope = await encryptJson({ secret: "value" }, key, aad);
    const decrypted = await decryptJson<{ secret: string }>(envelope, key, aad);

    expect(decrypted.secret).toBe("value");
    await expect(decryptJson(envelope, key, stableJson({ issuer: "x", aud: "other", typ: "z" }))).rejects.toThrow();
  });

  it("signs and verifies JWTs with explicit typ/iss/aud", async () => {
    const key = new Uint8Array(32).fill(7);
    const token = await signJwt({
      claims: { token_use: "test" },
      key,
      issuer: "https://issuer.example",
      audience: "https://aud.example",
      expiresInSeconds: 60,
      jwtId: "jwt-1",
      typ: "test+jwt",
    });

    const verified = await verifyJwt<{ token_use: string }>({
      token,
      key,
      issuer: "https://issuer.example",
      audience: "https://aud.example",
      typ: "test+jwt",
    });

    expect(verified.payload.token_use).toBe("test");
    await expect(
      verifyJwt({ token, key, issuer: "https://issuer.example", audience: "https://aud.example", typ: "wrong+jwt" }),
    ).rejects.toThrow();
  });

  it("creates and validates CSRF tokens", async () => {
    const key = new Uint8Array(32).fill(4);
    const payload = {
      csrf_kind: "authorize" as const,
      state: "state-1",
      client_id: "client-1",
      redirect_uri: "https://chat.openai.com/callback",
      code_challenge: "x".repeat(43),
      code_challenge_method: "S256" as const,
      scope: "telegram.notify",
      resource: "https://example.com/mcp",
    };

    const token = await createCsrfToken({ payload, key, issuer: "https://example.com" });
    await expect(verifyCsrfToken({ token, key, issuer: "https://example.com", expected: payload })).resolves.toBe(true);
    await expect(
      verifyCsrfToken({ token, key, issuer: "https://example.com", expected: { ...payload, state: "different" } }),
    ).resolves.toBe(false);
  });
});
