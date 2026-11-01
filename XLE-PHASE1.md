# Xorishi Lore Engine (XLE) — Phase 1 Foundation

**Status: development / disabled by default.** This branch does not deploy,
merge, activate, or autonomously run any characters.

## What is implemented

- Five stable character IDs: `gnisu`, `da_scribe`, `gnije`, `zytheris`, `tachiagarithevoid`.
- Server-owned `xle.config.json` registry; OpenAI or xAI selectable per character.
- Owner-supplied canon files in `xle-lore/*.txt`, checked before provisioning.
- Persistent SQLite tables `xle_characters` and `xle_memories`, created on Haven startup.
- Scoped memory operations for conversation, member, and lore-event data; explicit
  insertion only, retention cap, deletion API in storage layer.
- Native Haven webhook bot identities created by an administrator on request;
  no human login, no moderation, no voice permission, no token in XLE responses.
- Admin-only status, character listing, provisioning, and manual model preview API.
- Provider adapters with fixed OpenAI and xAI HTTPS destinations, bounded prompts,
  timeouts, and no redirects.

## Before enabling

1. Review and merge the branch **only after tests and security review**.
2. Replace every `PLACEHOLDER:` file in `xle-lore/` with approved hard-locked
   character canon. No personality or relationships have been invented.
3. Put `OPENAI_API_KEY`, `XAI_API_KEY`, `XLE_OPENAI_MODEL`, and
   `XLE_XAI_MODEL` in your private Haven environment, as needed. Never
   commit keys, tokens, member information, or private IPs.
4. Set `enabled: true` in `xle.config.json` after reviewing configuration.
5. Authenticate as a current Haven administrator and call
   `GET /api/xle/status`, then `GET /api/xle/characters`.
6. Provision a character into an existing non-DM channel using
   `POST /api/xle/characters/gnije/provision` with JSON
   `{"channel_id": 10}`. Repeat for other characters/channels as desired.
   **Provisioning creates a bot identity; it does not start AI conversations.**

All XLE endpoints require `Authorization: Bearer <admin Haven token>`.
Never share the bearer token or webhook token.

## AI egress / origin privacy

`XLE_ALLOW_DIRECT_AI_EGRESS=false` by default. In this mode the manual
preview endpoint refuses provider requests. Setting it to `true` permits
direct HTTPS calls to OpenAI and xAI, which **reveals the outbound server
IP to those providers**. Do not enable direct egress on a hidden Haven
origin. Phase 2 should implement an isolated AI gateway on a separate host
and an allowlisted, authenticated connection to that gateway. The gateway
must enforce outbound firewall policy and prevent secrets from reaching
models. The current adapter does **not** implement that gateway yet.

## Limits of Phase 1

- Bot identities use Haven's existing webhook system, **not** actual human
  user accounts. Online presence and bot-specific member-list integration
  are not implemented yet.
- No chat event listeners, mentions, autonomous conversations, bot-to-bot
  coordination, or voice participation yet.
- Memory functions are implemented but **not automatically called**.
  Consent, member memory review/deletion UI, and retention policy enforcement
  must be completed before recording member data.
- No XLE admin GUI yet; API is the first management surface.
- No canonical lore content is bundled; owner-supplied lore is required.
- XLE cannot be considered deployed or privacy-verified until the full Haven
  test suite, Docker build, provider integration, and live IP leak tests pass.

## Tests

Run `node --test test/xleFoundation.test.js` and `npm test` in an
environment with Haven's dependencies installed.
