# ADR-0001: Stateless OAuth artifacts with encrypted Telegram config envelope

- Date: 2026-05-02
- Status: accepted

## Context

The target runtime is Cloudflare Workers free tier, and the project explicitly forbids Durable Objects, KV, databases, and server-side session storage. OAuth still needs to carry user-specific Telegram configuration from consent through token exchange to authenticated MCP tool calls.

## Decision

Use signed JWT artifacts for the authorization code and access token. Embed Telegram configuration only as an AES-GCM encrypted envelope inside those JWTs. Keep plaintext claims limited to routing and validation metadata such as `iss`, `aud`, `client_id`, `scope`, `exp`, `jti`, and artifact type.

## Consequences

- Simple stateless deployment and portability across Worker isolates.
- No central revocation or one-time auth-code enforcement without adding state.
- Key rotation must account for validating older issued tokens during migration or require reconnect.

## Alternatives considered

- Durable Objects or KV for auth-code storage and revocation: rejected because stateful primitives are out of scope.
- Returning opaque codes and looking up config server-side: rejected for the same reason.
