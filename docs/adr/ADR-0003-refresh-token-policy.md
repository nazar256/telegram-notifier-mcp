# ADR-0003: Omit refresh tokens in stateless v1

- Date: 2026-05-02
- Status: accepted

## Context

The product brief allows refresh tokens if needed for client compatibility, but they are not strictly required for the first implementation and add more long-lived bearer material plus more policy surface.

## Decision

Do not implement refresh tokens in v1. Advertise only `authorization_code` in OAuth metadata and return `unsupported_grant_type` for refresh-token requests.

## Consequences

- Simpler stateless security model for v1.
- Users may need to reconnect after access-token expiry.
- If ChatGPT later proves to require refresh tokens for a good UX, add them as encrypted signed JWT artifacts and document the non-revocable stateless tradeoff.

## Alternatives considered

- Implement stateless refresh tokens immediately: deferred to keep v1 smaller and easier to audit.
