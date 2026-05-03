# telegram-notifier-mcp

Stateless Streamable HTTP MCP gateway for sending Telegram notifications from ChatGPT through the Telegram Bot API.

## What this server does

- Exposes a remote MCP server at `/mcp`.
- Implements OAuth Authorization Code + PKCE (`S256` only).
- Collects a Telegram BotFather bot token during authorization.
- Auto-discovers the destination private `chat_id` via `getUpdates` after the user messages the bot.
- Encrypts the bot token and `chat_id` into signed JWT artifacts.
- Exposes one MCP tool: `send_telegram_notification`.

## What this server does not do

- No Telegram MTProto or user-account login.
- No reading Telegram messages through MCP.
- No file/photo/document sending.
- No arbitrary Telegram API proxy.
- No server-side DB, KV, Durable Objects, D1, R2, or cache-backed sessions.

## Telegram setup

1. Open Telegram and chat with `@BotFather`.
2. Create a bot and copy the token.
3. Open your new bot chat.
4. Send `/start` or any message to the bot before authorizing this MCP server.

This step matters because a Telegram bot token alone is not enough to send messages; the bot also needs a `chat_id`.

## ChatGPT connector settings

- **MCP Server URL:** `https://telegram-notifier-mcp.xyofn8h7t.workers.dev/mcp`
- **Authorization server base URL:** `https://telegram-notifier-mcp.xyofn8h7t.workers.dev`
- **Resource:** `https://telegram-notifier-mcp.xyofn8h7t.workers.dev/mcp`

## Required Worker secrets

Set these with `wrangler secret put`:

```bash
wrangler secret put OAUTH_JWT_SIGNING_KEY_B64
wrangler secret put UPSTREAM_CONFIG_ENC_KEY_B64
wrangler secret put CSRF_SIGNING_KEY_B64
```

Recommended values:

- `OAUTH_JWT_SIGNING_KEY_B64`: base64 of at least 32 random bytes
- `UPSTREAM_CONFIG_ENC_KEY_B64`: base64 of 32 random bytes
- `CSRF_SIGNING_KEY_B64`: base64 of at least 32 random bytes

Example local `.dev.vars` values can be based on `.dev.vars.example`.

## Wrangler vars

Set these in `wrangler.toml` or your Cloudflare environment:

```text
ENVIRONMENT=production
OAUTH_ISSUER=https://your-worker.example.com
MCP_RESOURCE=https://your-worker.example.com/mcp
MCP_AUDIENCE=https://your-worker.example.com/mcp
OAUTH_REDIRECT_HTTPS_HOSTS=chatgpt.com,*.chatgpt.com,chat.openai.com,*.openai.com,github.com,*.github.com,claude.ai,*.claude.ai,anthropic.com,*.anthropic.com
ACCESS_TOKEN_TTL_SECONDS=31536000
AUTH_CODE_TTL_SECONDS=120
```

Notes:

- `ACCESS_TOKEN_TTL_SECONDS` is the server-side maximum lifetime the authorize UI may mint. The UI can request shorter durations (30/90/365/custom) but not exceed this cap.
- Refresh tokens are intentionally not implemented in v1, so there is no refresh-token TTL setting to tune.
- Loopback HTTP redirect URIs (`localhost`, `127.0.0.1`, `::1`) are allowed for OAuth native clients, including production deployments, to support standards-compliant local callback handlers.

## Local development

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm test
npm run typecheck
```

Start locally:

```bash
wrangler dev
```

## Deploy

Deploy only after tests and typecheck pass:

```bash
npm run deploy
```

## OAuth and authorization UX

The `/authorize` page:

- validates OAuth parameters and PKCE method `S256`
- asks for the Telegram bot token
- attempts `getMe` to validate the token
- attempts `getUpdates` to discover a single private chat
- allows manual `chat_id` entry under Advanced options
- optionally sends a test message if the user selects that checkbox

## Tool surface

### `send_telegram_notification`

Input:

```ts
{
  message: string; // 1..3500 chars
  disable_notification?: boolean;
}
```

Behavior:

- sends a text message to the configured Telegram private chat
- disables link previews by default
- returns a concise success message with Telegram `message_id`
- returns sanitized MCP tool errors if Telegram rejects the request

## Smoke tests

```bash
curl https://your-worker.example.com/health
curl https://your-worker.example.com/.well-known/oauth-authorization-server
curl https://your-worker.example.com/.well-known/oauth-protected-resource
curl -i https://your-worker.example.com/mcp
```

Expected unauthenticated `/mcp` behavior:

- HTTP `401`
- `WWW-Authenticate` header includes `resource_metadata` and `scope="telegram.notify"`

## Stateless security limitations

- Stateless auth codes cannot be enforced as one-time-use without adding server-side state, so they are short-lived and protected by PKCE.
- Stateless refresh tokens are not implemented in v1. If added later, they will not be centrally revocable without state.
- Key rotation needs a migration plan or forced reconnect.
- Best-effort in-memory throttling would not be globally reliable on Workers.
- Telegram messages go through Telegram infrastructure; do not use this tool for secrets, credentials, customer data, or sensitive dumps.

## Validation status

Verified locally:

- `npm test`
- `npm run typecheck`
- `wrangler dev --local` on `127.0.0.1:8792`
- `GET /health`
- `GET /.well-known/oauth-authorization-server`
- `GET /.well-known/oauth-protected-resource`
- unauthenticated `GET /mcp` returns `401` with `WWW-Authenticate` and `resource_metadata`
- browser validation of the authorize page rendering with omitted OAuth `state`

Verified on the deployed Worker:

- `GET https://telegram-notifier-mcp.xyofn8h7t.workers.dev/health`
- `GET https://telegram-notifier-mcp.xyofn8h7t.workers.dev/.well-known/oauth-authorization-server`
- `GET https://telegram-notifier-mcp.xyofn8h7t.workers.dev/.well-known/oauth-protected-resource`
- unauthenticated `GET https://telegram-notifier-mcp.xyofn8h7t.workers.dev/mcp` returns `401` with `WWW-Authenticate` and `resource_metadata`

Not yet verified in this environment:

- real Telegram bot end-to-end authorization
- real ChatGPT connector flow
