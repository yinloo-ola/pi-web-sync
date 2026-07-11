---
id: 0007
title: "Stop swallowing errors: surface config and sync failures"
type: task
parent: 0001
blocked_by: []
assigned: yinlootan
status: closed
---

## Question

Replace the silent `catch {}` blocks that hide real failures with warnings the
user (and a debugging self-hoster) can actually see.

## Resolution

Four `catch {}` blocks replaced:

1. **`loadConfig()` config parse** (`index.ts`) — now logs a `console.warn` naming
   the file path and error message, then falls back to env vars (no crash).
2. **`onSyncRequest` handler** (`index.ts`) — now logs a `console.warn` with the
   error on sync_response failure instead of silently swallowing.
3. **Wire message parse** (`relay-client.ts`) — now logs at `console.debug` with
   the error message (malformed messages are expected noise, not actionable).
4. **QR code render** (`index.ts`) — now logs at `console.debug` before the
   graceful fallback to `ui.notify`.

Logging convention: `[pi-web-sync]` prefix, matching the webapp's `[useRelay]`
style. `console.warn` for actionable failures; `console.debug` for expected noise.

**Done when** checklist:
- ✅ Config parse failure logs a warning naming the file and parse error
- ✅ Sync-response failure logs a warning
- ✅ Debug-level for wire message and QR swallows (consistent)
- ✅ No happy-path behavior change; tsc clean, 17/17 extension+relay tests pass
- ✅ Noted for observability fog item (small-ticket candidate if it grows)

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