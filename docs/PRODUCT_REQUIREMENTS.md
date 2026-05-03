# Product Requirements

## Product summary

A remote MCP server for ChatGPT that sends Telegram notifications via the Telegram Bot API using a user-provided bot token and a resolved private `chat_id`.

## User flow

1. User connects the MCP server from ChatGPT.
2. ChatGPT starts OAuth Authorization Code + PKCE.
3. Consent page explains how to obtain a BotFather token and asks the user to message the bot first.
4. User submits bot token and optionally a manual `chat_id` fallback.
5. Server validates the bot token with `getMe`, resolves private `chat_id` via `getUpdates` when possible, encrypts config, and redirects back with a short-lived auth code.
6. ChatGPT exchanges code for a bearer token.
7. ChatGPT calls the `send_telegram_notification` tool via `/mcp`.

## OAuth flow requirements

- Authorization Code + PKCE only.
- PKCE must require `S256`.
- Dynamic client registration must be stateless and deterministic.
- Protected-resource metadata must be published for `/mcp`.
- Unauthenticated `/mcp` responses must include `WWW-Authenticate` with `resource_metadata` and required scope.

## Security requirements

- No DB, KV, Durable Objects, D1, R2, cache-based session storage, or server-side token persistence.
- Telegram bot token and resolved `chat_id` must be encrypted into signed JWT artifacts.
- Only Cloudflare Worker secrets may be long-lived server-side secrets.
- Redirect allowlists, CSRF, issuer/resource/audience validation, and JWT type checks are mandatory.
- No secret-bearing values may be logged or reflected.

## Non-goals

- Telegram user-account login.
- Reading Telegram messages through MCP.
- Sending files or arbitrary Telegram API calls.
- Webhook handling.
- Multi-recipient routing.

## Acceptance criteria

- ChatGPT can discover metadata, register, authorize, exchange a code, and call the tool.
- Tool input is LLM-friendly and limited to notification text plus silence toggle.
- Telegram messages are sent using only the encrypted per-user config in the bearer token.
- Docs explain chat-id discovery, setup, smoke tests, and stateless limitations.

## Consent-page UX copy requirements

- Explain BotFather setup briefly.
- Tell the user to open the bot chat and send `/start` or another message before retrying auto-discovery.
- State that the token is encrypted into the OAuth credential and is not stored server-side.
- Provide a clear fallback path for manual `chat_id` entry when discovery fails or is ambiguous.
