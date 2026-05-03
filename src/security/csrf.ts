import { z } from "zod";

import { signJwt, verifyJwt } from "./crypto";

const csrfPayloadSchema = z.object({
  csrf_kind: z.literal("authorize"),
  state: z.string().min(1).optional(),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256"),
  resource: z.string().url().optional(),
  scope: z.string().min(1),
});

export type CsrfPayload = z.infer<typeof csrfPayloadSchema>;

export async function createCsrfToken(params: {
  payload: CsrfPayload;
  key: Uint8Array;
  issuer: string;
}): Promise<string> {
  return signJwt({
    claims: params.payload,
    key: params.key,
    issuer: params.issuer,
    audience: params.issuer,
    expiresInSeconds: 900,
    jwtId: crypto.randomUUID(),
    typ: "csrf+jwt",
  });
}

export async function verifyCsrfToken(params: {
  token: string;
  key: Uint8Array;
  issuer: string;
  expected: CsrfPayload;
}): Promise<boolean> {
  const verified = await verifyJwt<CsrfPayload>({
    token: params.token,
    key: params.key,
    issuer: params.issuer,
    audience: params.issuer,
    typ: "csrf+jwt",
  });

  const parsed = csrfPayloadSchema.parse(verified.payload);

  return Object.entries(params.expected).every(([key, value]) => parsed[key as keyof CsrfPayload] === value);
}
