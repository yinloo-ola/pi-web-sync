---
id: 0007
title: "Stop swallowing errors: surface config and sync failures"
type: task
parent: 0001
blocked_by: []
assigned: null
status: open
---

## Question

Replace the silent `catch {}` blocks that hide real failures with warnings the
user (and a debugging self-hoster) can actually see.

## Context

Silent swallows today:
- `index.ts` `loadConfig()` — a malformed `~/.pi-web-sync.json` is ignored, the
  extension proceeds with empty URLs, and the user sees a generic "relay
  connection failed" with no clue why.
- `index.ts` `onSyncRequest` handler — `catch {}` masks `client!` being null or
  a `getBranch()` failure, so the web app silently gets no history.
- `relay-client.ts` message parse `catch {}` — fine to keep (ignore malformed
  wire messages), but log at debug level.
- `index.ts` QR `catch {}` — fine (graceful fallback to notify), keep.

## Done when

- Config parse failure logs a warning naming the file and the parse error, and
  falls back to env vars (existing behavior) — don't crash.
- Sync-response failure logs a warning instead of silently swallowing.
- Decide the logging level for the two "fine to keep" swallows and apply it
  consistently (debug vs silent).
- No behavior change for the happy path; existing tests pass.
- If this surfaces a need for more structured logging, note it for the map's
  "observability" fog item (may graduate a small ticket).