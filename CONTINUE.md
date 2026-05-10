# CONTINUE.md

## Current task

Publication-readiness cleanup for the stateless Cloudflare Worker Telegram notification MCP gateway.

## Current branch / environment

- Branch: `main`
- Runtime target: Cloudflare Workers
- Package manager: npm

## Done

- Scaffolded the repository from empty.
- Verified current MCP SDK Worker transport API on `@modelcontextprotocol/sdk@1.29.0`.
- Implemented config parsing, crypto/JWT/AES-GCM/CSRF/redaction helpers, OAuth metadata/register/authorize/token handlers, Telegram client, and stateless `/mcp` handling.
- Implemented the `send_telegram_notification` MCP tool.
- Added tests for config, metadata, security, OAuth flows, Telegram client behavior, and MCP auth/tool flow.
- Added README and ADRs.
- Fixed native-client compatibility for omitted OAuth `state`.
- Enforced access-token TTL cap against operator config.
- Added no-store/no-cache token responses.
- Pinned dependency versions and refreshed lockfile.
- Passed `npm run typecheck` and `npm test`.
- Passed local `wrangler dev --local` smoke checks for `/health`, metadata, and unauthenticated `/mcp`.
- Verified in browser that `/authorize` renders correctly when `state` is omitted.
- Deployed Worker successfully and validated the public production path.
- Verified deployed `/health`, auth metadata, protected resource metadata, and unauthenticated `/mcp` challenge.
- Added and validated GitHub Actions CI/CD deploy workflow.
- Fixed Wrangler CI Node version requirement.
- Fixed Streamable HTTP SSE cleanup so ChatGPT tool calls do not hang.
- Verified OAuth login and `send_telegram_notification` through `mcpc` against production.
- Verified ChatGPT connector OAuth integration and Telegram message sending.

## Next

- Review and commit the publication-readiness cleanup.
- Keep README / project-state validation evidence current after future production smoke tests.

## Blockers / risks

- Stateless tokens are not centrally revocable; key rotation or expiration is the revocation mechanism for v1.
- Keep OAuth redirect hosts narrow to intended clients before publishing/deploying forks.

## Important files

- `package.json`
- `wrangler.toml`
- `src/index.ts`
- `src/oauth/*`
- `src/mcp/*`
- `src/security/*`
- `src/telegram/*`
- `docs/PROJECT_STATE.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/DECISIONS.md`

## Last validation

- Passed: `npm run typecheck`
- Passed: `npm test`
- Passed: local `wrangler dev --local` smoke checks (`/health`, auth metadata, protected resource metadata, unauthenticated `/mcp`)
- Passed: browser authorize-page render test with omitted OAuth `state`
- Passed: deployed `/health`
- Passed: deployed auth and protected-resource metadata endpoints
- Passed: deployed unauthenticated `/mcp` returns `401` with `WWW-Authenticate`
- Passed: live OAuth + tool call through `mcpc`
- Passed: live ChatGPT connector OAuth + Telegram tool execution

## Notes for the next agent

- `/mcp` is stateless and uses `WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })`.
- Unauthenticated `/mcp` returns `401` plus `WWW-Authenticate` with `resource_metadata`.
- Refresh tokens are intentionally omitted in v1.
- Loopback HTTP redirect URIs are intentionally allowed for native clients, including production.
- Keep docs updated with real validation evidence if external smoke tests are completed.
