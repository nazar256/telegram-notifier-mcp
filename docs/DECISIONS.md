# Decisions

## Durable decisions index

This file summarizes durable architectural decisions and points to ADRs for deeper rationale.

## Current decisions

1. **Stateless-by-design v1**  
   No DB, KV, Durable Objects, cache-based sessions, or other persistent server-side state for OAuth or Telegram config.

2. **Signed JWT artifacts + encrypted secret envelope**  
   OAuth auth codes and access tokens are signed JWTs carrying encrypted Telegram config rather than server-side references.

3. **Telegram Bot API only**  
   This gateway uses BotFather bot tokens and `sendMessage`; no MTProto or user-account flows.

4. **Project status docs live outside agent instruction files**  
   `CONTINUE.md` and `docs/*` are canonical for progress and requirements; `AGENTS.md` remains instruction-only.

## Planned ADRs

- ADR-0001: Stateless OAuth/JWT config-envelope architecture.
- ADR-0002: Telegram chat-id discovery and manual fallback policy.
- ADR-0003: Refresh-token policy for stateless v1.

## ADR links

- `docs/adr/ADR-0001-stateless-oauth-jwt-envelope.md`
- `docs/adr/ADR-0002-telegram-chat-id-resolution.md`
- `docs/adr/ADR-0003-refresh-token-policy.md`
