import { sha256Base64Url } from "../security/crypto";

export async function verifyPkceS256(codeVerifier: string, expectedChallenge: string): Promise<boolean> {
  const actual = await sha256Base64Url(codeVerifier);
  return actual === expectedChallenge;
}
