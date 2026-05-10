# Project State

## Current phase

Phase 1 - core implementation complete, deployed to Cloudflare Workers, pushed to GitHub, and externally validated with ChatGPT + Telegram.

## Scope

Build a stateless Streamable HTTP MCP gateway on Cloudflare Workers that authenticates users via OAuth Authorization Code + PKCE, captures a Telegram bot token during consent, resolves or accepts a private `chat_id`, encrypts that config into signed JWT artifacts, and exposes one notification-sending MCP tool.

## Progress summary

Repository scaffold, core Worker implementation, tests, CI/CD, and operator docs are in place. Local typecheck and test suite pass. A public deployment has been validated end-to-end: health/metadata/unauthenticated MCP checks pass, OAuth login works with `mcpc`, the `send_telegram_notification` MCP tool sends Telegram messages, and ChatGPT connector OAuth + tool execution has been validated.

## Completed

- Created source, test, and docs directory structure.
- Added `package.json`, `tsconfig.json`, `vitest.config.ts`, `wrangler.toml`, and `.dev.vars.example`.
- Added agent boundary file `AGENTS.md`.
- Added handoff file `CONTINUE.md`.
- Added project-state, implementation-plan, requirements, and decisions docs.
- Implemented typed config parsing and validation.
- Implemented AES-GCM envelope encryption, JWT signing/verification, PKCE verification, CSRF signing/verification, and secret redaction helpers.
- Implemented OAuth metadata, dynamic client registration, authorization page GET/POST handlers, and authorization-code token exchange.
- Implemented Worker-safe Telegram Bot API client with schema validation and sanitized errors.
- Implemented authenticated stateless Streamable HTTP `/mcp` route with one notification tool.
- Added Vitest coverage for config, security, OAuth handlers, Telegram client behavior, and MCP auth/tool flow.
- Added README and ADRs.
- Fixed native-client compatibility when OAuth `state` is omitted.
- Added server-side enforcement for requested access-token TTL against operator maximum.
- Added OAuth token response cache-busting headers.
- Pinned dependency versions for reproducible builds.
- Allowed standards-compliant loopback HTTP redirect URIs for native clients in production.
- Deployed the Worker publicly and validated the production path end-to-end.
- Verified public `/health`, authorization metadata, protected resource metadata, and unauthenticated `/mcp` challenge on the deployed Worker.
- Added GitHub Actions CI/CD workflow for typecheck/tests and Cloudflare Workers deploy.
- Fixed CI Node version for current Wrangler requirements.
- Fixed MCP Streamable HTTP SSE lifecycle cleanup so ChatGPT tool calls complete instead of hanging.
- Verified OAuth login and tool call with `mcpc` against the deployed Worker.
- Verified ChatGPT connector OAuth integration and Telegram message sending.

## In progress

- Publication-readiness cleanup and final operator-doc review.

## Remaining

- Optional: add more lifecycle-focused SSE tests if future changes touch `/mcp` streaming behavior.

## Blocked / unresolved

- None known for the current v1 publication scope.

## Decisions and links

- Durable state primitives are out of scope for v1.
- Project status is intentionally stored outside `AGENTS.md`.
- See `docs/DECISIONS.md` for durable architectural decisions.
- Verified current SDK import path: `@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js` with `sessionIdGenerator: undefined` and `enableJsonResponse: true`.

## Validation evidence

- Passed: `npm run typecheck`
- Passed: `npm test`
- Passed: local `wrangler dev --local` smoke checks for `/health`, auth metadata, protected resource metadata, and unauthenticated `/mcp`
- Passed: browser check of `/authorize` rendering with omitted OAuth `state`
- Passed: deployed `/health`
- Passed: deployed `/.well-known/oauth-authorization-server`
- Passed: deployed `/.well-known/oauth-protected-resource`
- Passed: deployed unauthenticated `GET /mcp` returns `401` with `WWW-Authenticate` and `resource_metadata`
- Passed: OAuth login and `send_telegram_notification` tool call via `mcpc`
- Passed: ChatGPT connector OAuth integration and Telegram message sending

## Fresh-start instructions

1. Run `npm test` and `npm run typecheck` before publishing changes.
2. If rotating Worker secrets, expect existing OAuth/access tokens to require reconnect.
3. Keep `OAUTH_REDIRECT_HTTPS_HOSTS` narrowed to intended client redirect hosts.
