import { jwtVerify, SignJWT, type JWTPayload } from "jose";

export interface EncryptedEnvelope {
  v: 1;
  iv: string;
  ct: string;
  kid?: string;
}

export interface JwtVerificationResult<T extends JWTPayload> {
  payload: T;
  protectedHeader: { alg?: string; typ?: string; kid?: string };
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function utf8ToBytes(value: string): Uint8Array {
  return textEncoder.encode(value);
}

export function bytesToUtf8(value: Uint8Array): string {
  return textDecoder.decode(value);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  const decoded = atob(normalized + "=".repeat(padding));
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toArrayBuffer(rawKey), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(utf8ToBytes(value)));
  return bytesToBase64Url(new Uint8Array(digest));
}

export function stableJson(value: Record<string, string | number | boolean | undefined>): string {
  const sortedEntries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(Object.fromEntries(sortedEntries));
}

export async function encryptJson<T>(
  value: T,
  rawKey: Uint8Array,
  aad: string,
  kid?: string,
): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(rawKey);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(utf8ToBytes(aad)),
    },
    key,
    toArrayBuffer(utf8ToBytes(JSON.stringify(value))),
  );

  return {
    v: 1,
    iv: bytesToBase64Url(iv),
    ct: bytesToBase64Url(new Uint8Array(ciphertext)),
    kid,
  };
}

export async function decryptJson<T>(
  envelope: EncryptedEnvelope,
  rawKey: Uint8Array,
  aad: string,
): Promise<T> {
  const key = await importAesKey(rawKey);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(base64UrlToBytes(envelope.iv)),
      additionalData: toArrayBuffer(utf8ToBytes(aad)),
    },
    key,
    toArrayBuffer(base64UrlToBytes(envelope.ct)),
  );

  return JSON.parse(bytesToUtf8(new Uint8Array(plaintext))) as T;
}

export async function signJwt<T extends JWTPayload>(params: {
  claims: T;
  key: Uint8Array;
  issuer: string;
  audience: string;
  expiresInSeconds: number;
  jwtId: string;
  typ: string;
}): Promise<string> {
  return new SignJWT(params.claims)
    .setProtectedHeader({ alg: "HS256", typ: params.typ })
    .setIssuer(params.issuer)
    .setAudience(params.audience)
    .setIssuedAt()
    .setJti(params.jwtId)
    .setExpirationTime(`${params.expiresInSeconds}s`)
    .sign(params.key);
}

export async function verifyJwt<T extends JWTPayload>(params: {
  token: string;
  key: Uint8Array;
  issuer: string;
  audience: string;
  typ: string;
}): Promise<JwtVerificationResult<T>> {
  const verified = await jwtVerify(params.token, params.key, {
    issuer: params.issuer,
    audience: params.audience,
    typ: params.typ,
  });

  return {
    payload: verified.payload as T,
    protectedHeader: verified.protectedHeader,
  };
}
