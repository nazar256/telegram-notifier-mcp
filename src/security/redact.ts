const TELEGRAM_TOKEN_PATTERN = /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g;
const BEARER_PATTERN = /(Bearer\s+)([A-Za-z0-9._~-]+)/gi;
const TELEGRAM_URL_PATTERN = /(https:\/\/api\.telegram\.org\/bot)([^/]+)(\/[^\s"']*)?/gi;

export function redactSecrets(input: string): string {
  return input
    .replace(TELEGRAM_URL_PATTERN, "$1[REDACTED]$3")
    .replace(TELEGRAM_TOKEN_PATTERN, "[REDACTED_TELEGRAM_TOKEN]")
    .replace(BEARER_PATTERN, "$1[REDACTED]");
}

export function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return redactSecrets(error.message);
  }
  return redactSecrets(String(error));
}
