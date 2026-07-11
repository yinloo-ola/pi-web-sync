---
id: 0004
title: "Enforce a single browser tab per session at the relay"
type: task
parent: 0001
blocked_by: []
assigned: tan.yinloo
status: closed
---

## Question

Make the relay reject a second web-client connection to a session that already
has an active web client, instead of silently replacing it.

## Context

- Currently both `packages/relay/src/relay-server.ts` (Node dev relay) and
  `packages/relay/src/index.ts` (`SessionDO`, production) replace an existing
  web connection when a new one arrives and notify the old peer
  `peer_disconnected`. The old tab is left in a dead state.
- Requirement: only one browser tab per session. A second attempt should be
  **rejected** (closed with a clear reason), not swapped in.
- Pi reconnecting (replacing an existing pi connection) is a separate case and
  should still work — the limit is one **web** client, not one of each type.
- The web app should show a meaningful message when rejected (coordinate the
  close code/reason with ticket 0002's error handling).

## Done when

- In both relay implementations: when a `?client=web` connection arrives and an
  active (`OPEN`) web connection already exists for that session, the new
  connection is closed with a distinct code/reason, e.g.
  `ws.close(4001, "Session already has an active browser")`.
- If the existing web connection is not open (stale/closed), the new one is
  accepted and replaces it (so a crashed tab doesn't lock the session forever —
  also covered by heartbeat/0006 detecting the dead one).
- The web app, on receiving that close code, shows "This session is already open
  in another tab" rather than retrying forever (partysocket would otherwise
  hammer the relay — make this close non-reconnectable, e.g. by recognizing the
  code and calling `close()`).
- Both relays get a test for the reject path.

## Note

This intentionally rules out multi-tab fan-out (see map Out of scope).

## Resolution

Both relays now reject a second *web* client while one is active, and the web
app surfaces it instead of reconnect-looping.

### Close code: 4002 (not the ticket's example 4001)

`relay-server.ts` already used 4001 for invalid path/client, so duplicate-tab
gets **4002** (`CLOSE_DUPLICATE_WEB`). Defined once in a new shared module
`packages/relay/src/close-codes.ts` (`CLOSE_INVALID_REQUEST=4001`,
`CLOSE_DUPLICATE_WEB=4002`, an `isOpen` helper). The web app mirrors 4002
locally in `useRelay.ts` until ticket 0008 lands a shared constants package.

### What changed

- **`close-codes.ts` (new)** — single source for the close codes + `isOpen`, a
  generic type guard so a truthy result narrows away null at each call site.
- **`relay-server.ts` (dev relay)** — rejects a second active web with 4002;
  refactored to export `handleConnection` + `createRelay(port)` so the policy
  can be integration-tested (auto-start now guarded to a main-module check so
  importing it in tests doesn't bind a port).
- **`index.ts` (Durable Object)** — same reject check after `server.accept()`.
  Drive-by: replaced three `WebSocket.READY_STATE_OPEN` references with
  `isOpen`, which clears the pre-existing relay tsc errors (flagged in 0002) and
  likely fixes a latent bug — that static doesn't exist on the Workers type, so
  the peer-notify branches may never have fired.
- **webapp `useRelay.ts`** — `shouldReconnectOnClose: e => e.code !== 4002` stops
  partysocket retrying on the reject; the close handler surfaces a new
  `"rejected"` `RelayState`.
- **webapp `Chat.tsx`** — "This session is already open in another tab" banner
  with a **Try again** button (generalized with the failed-state banner).

### Close-tracking (the design question raised mid-ticket)

A cleanly-closed tab frees the session **two ways**: the per-connection close
listener nulls the slot (`pair.web = null` / `this.web = null`), and `isOpen`
re-checks `readyState === OPEN` so a closed-but-not-yet-nulled slot won't block.
The **rejected** second tab does *not* clobber the first's slot — the reject
path returns before the close listener is attached, so that socket's close is a
no-op on the session map.

A **half-open zombie** (network drop, no close frame) still looks OPEN until TCP
times out, so a new tab would be rejected in the meantime. That is deliberately
**out of 0004's scope and deferred to 0006 (heartbeat)**, which detects the dead
peer, closes it, and nulls the slot. Both reject sites now carry a comment
pointing at 0006.

### Verification

- relay `tsc --noEmit`: clean (per-package; READY_STATE_OPEN errors gone).
- relay `vitest`: 6/6 — `isOpen` unit + integration (reject 2nd web with 4002,
  accept after close, pi replaces pi, web+pi coexist, invalid path still 4001).
- webapp `tsc --noEmit` + `vitest`: clean, 2/2 (buffering from 0002; new
  rejected/no-reconnect case).
- webapp `vite build`: 289 modules.

### Known limitation

The DO reject path (`server.close(4002)` before returning the 101 Response) is
**not integration-tested** — confirming the close code reaches the browser needs
`@cloudflare/vitest-pool-workers`/miniflare, which isn't set up. The Node dev
relay (same policy, via `close-codes.ts`) is integration-tested end-to-end. If
the DO's close delivery proves unreliable in practice, a follow-up can either
stand up miniflare or fall back to an HTTP 409 + webapp error-message path.