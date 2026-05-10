# Implementation Plan

## Status legend

- `todo`
- `in_progress`
- `blocked`
- `done`
- `deferred`

## Tasks

| ID | Task | Status | Depends on | Validation |
|---|---|---|---|---|
| T01 | Scaffold repository structure and baseline config files | done | - | File presence review |
| T02 | Verify current MCP SDK Worker Streamable HTTP API and transport import path | done | T01 | Installed package type inspection completed against `@modelcontextprotocol/sdk@1.29.0` |
| T03 | Implement env/config parsing and validation | done | T02 | `tests/config.test.ts`, `npm run typecheck` |
| T04 | Implement base64url, JWT, AES-GCM, CSRF, and redaction helpers | done | T03 | `tests/security.test.ts` |
| T05 | Implement OAuth authorization-server and protected-resource metadata endpoints | done | T03 | `tests/oauth.metadata.test.ts` |
| T06 | Implement stateless dynamic client registration | done | T03 | `tests/oauth.handlers.test.ts` |
| T07 | Implement `/authorize` GET consent page and POST submission flow | done | T03, T04, T06 | `tests/oauth.handlers.test.ts`; local browser validation confirmed the page renders when OAuth `state` is omitted |
| T08 | Implement `/token` authorization_code exchange and optional refresh-token policy | done | T04, T06, T07 | `tests/oauth.handlers.test.ts` |
| T09 | Implement Telegram Bot API client and validation/redaction behavior | done | T03, T04 | `tests/telegram.client.test.ts` |
| T10 | Implement authenticated `/mcp` Streamable HTTP handler and per-request MCP server lifecycle | done | T02, T04, T08, T09 | `tests/mcp.server.test.ts` |
| T11 | Implement `send_telegram_notification` tool | done | T09, T10 | `tests/mcp.server.test.ts` |
| T12 | Add README, deployment docs, and env examples | done | T03-T11 | README added; smoke commands documented |
| T13 | Record durable decisions/ADRs | done | T02-T11 | `docs/DECISIONS.md` and ADR files added |
| T14 | Run validation and record evidence; update handoff docs | done | T03-T13 | Passed `npm test`, `npm run typecheck`, local `wrangler dev` smoke checks, browser authorize-page validation without OAuth `state`, deployed-worker public endpoint checks, `mcpc` OAuth/tool-call smoke test, and ChatGPT connector OAuth/tool execution |

## Notes

- Refresh tokens may be omitted in v1 if ChatGPT compatibility works without them; if omitted, metadata must not advertise them and docs must explain why.
- Real Telegram smoke validation is manual because it needs user-supplied bot credentials; a public deployment has been validated with `mcpc` and ChatGPT.
