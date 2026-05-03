# ADR-0002: Telegram private chat-id resolution with manual fallback

- Date: 2026-05-02
- Status: accepted

## Context

Telegram Bot API `sendMessage` requires both a bot token and a target `chat_id`. The intended product UX should stay simple and should not force most users to learn how to find a `chat_id` manually.

## Decision

During OAuth authorization:

1. Validate the bot token with `getMe`.
2. Attempt to discover a destination `chat_id` via `getUpdates`.
3. Accept only a single unambiguous private chat.
4. If discovery fails or multiple plausible private chats exist, show a clear error and allow a manual `chat_id` fallback.

## Consequences

- Keeps the common-path UX simple.
- Avoids silently guessing among multiple private chats.
- Does not support webhook-only bots that cannot use `getUpdates` without additional operator/user action.

## Alternatives considered

- Require manual `chat_id` entry for everyone: rejected as unnecessarily complex.
- Guess the most recent private chat automatically: rejected as too risky.
