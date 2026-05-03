# Project State

## Current phase

Phase 1 - core implementation complete, deployed to Cloudflare Workers, pending git history/push and external end-to-end validation.

## Scope

Build a stateless Streamable HTTP MCP gateway on Cloudflare Workers that authenticates users via OAuth Authorization Code + PKCE, captures a Telegram bot token during consent, resolves or accepts a private `chat_id`, encrypts that config into signed JWT artifacts, and exposes one notification-sending MCP tool.

## Progress summary

Repository scaffold, core Worker implementation, tests, and operator docs are in place. Local typecheck and test suite pass. Local `wrangler dev` smoke checks pass, including OAuth metadata and unauthenticated `/mcp`. Browser validation also confirmed the authorize page now renders correctly when OAuth `state` is omitted by a native client. The Worker is now deployed publicly at `https://telegram-notifier-mcp.xyofn8h7t.workers.dev`, and public health/metadata/unauthenticated MCP checks pass. Real Telegram credentials and real ChatGPT connector tool execution remain unverified in this environment.

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
- Deployed the Worker to `https://telegram-notifier-mcp.xyofn8h7t.workers.dev`.
- Verified public `/health`, authorization metadata, protected resource metadata, and unauthenticated `/mcp` challenge on the deployed Worker.

## In progress

- Git history/push plus external live validation.

## Remaining

- Perform a real Telegram authorization + tool-call smoke test with a live bot token.
- Perform a real ChatGPT connector compatibility check.
- Initialize git history and push to the intended GitHub repository.

## Blocked / unresolved

- Real Telegram and ChatGPT end-to-end validation require external credentials/client interaction not available in this session.
- Repository is not yet a git repo, so commit/push cannot happen until git is initialized or an existing remote repo is specified.
- No existing GitHub repository named `nazar256/telegram-notifier-mcp` was found from this environment despite the user expectation that one already exists.

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
- Passed: deployed `https://telegram-notifier-mcp.xyofn8h7t.workers.dev/health`
- Passed: deployed `https://telegram-notifier-mcp.xyofn8h7t.workers.dev/.well-known/oauth-authorization-server`
- Passed: deployed `https://telegram-notifier-mcp.xyofn8h7t.workers.dev/.well-known/oauth-protected-resource`
- Passed: deployed unauthenticated `GET /mcp` returns `401` with `WWW-Authenticate` and `resource_metadata`
- Not run: real Telegram smoke test
- Not run: real ChatGPT connector test

## Fresh-start instructions

1. Initialize or attach the intended git repository before committing/pushing.
2. Run one real Telegram end-to-end auth + tool-call validation with live credentials against the deployed Worker.
3. Validate ChatGPT connector compatibility against the deployed Worker.
