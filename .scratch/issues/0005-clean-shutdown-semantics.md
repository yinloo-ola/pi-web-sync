---
id: 0005
title: "Clean shutdown: disconnect and session_shutdown must not auto-reconnect"
type: task
parent: 0001
blocked_by: [0003]
assigned: tan.yinloo
status: closed
---

## Resolution

Clean shutdown was already implemented correctly by tickets 0003 and 0004 — this ticket verified the behavior, fixed a pre-existing bug, and added test coverage.

### How it works

**Extension (`relay-client.ts`):**
- `disconnect()` sets `intentionalClose = true`, clears heartbeat/stable timers, and calls `ws.close()`.
- The partysocket close handler checks `intentionalClose` and returns early — no reconnect attempt.
- `client` is set to `null` after disconnect, so a subsequent `/web-sync connect` creates a fresh `RelayClient`.

**Extension (`index.ts`):**
- `/web-sync disconnect` calls `disconnectRelay()` → `client.disconnect()` → clears widget, status, and session state.
- `session_shutdown` handler does the same — relay sees a clean close, frees the session slot, and sends `peer_disconnected` to the web app.

**Web app (`useRelay.ts`):**
- Effect cleanup sets `intentionalCloseRef = true` and calls `ws.close()` — partysocket does not reconnect.
- When pi disconnects, the web app receives `peer_disconnected` → `piStatus` → `"disconnected"`; the web socket itself stays open.

### Bug fixed

`relay-client.ts` had a duplicate `private readonly options` property declaration (typed as both `ReconnectOptions` and `RelayClientOptions`). The second declaration shadowed the first, and the merged object included `RelayClientOptions` fields (like `heartbeat`) that aren't on `ReconnectOptions`. Fixed by storing `heartbeat` in its own field and keeping `options` as `ReconnectOptions` only.

### Tests added

- `"does not trigger auto-reconnect after deliberate disconnect"` — disconnects, waits, asserts no `reconnecting` status appears.
- `"allows a fresh connect after disconnect"` — disconnects, reconnects, verifies a new socket is created.

All 10 extension tests pass (was 8). No regressions.

---

## Question

Ensure `/web-sync disconnect` and quitting the pi session (`session_shutdown`)
fully tear down the connection and do **not** trigger auto-reconnect, and that
the next `/web-sync connect` starts fresh.

## Context

- `partysocket`'s `close()` is a deliberate close — it does NOT auto-reconnect.
  A connection that drops on its own DOES reconnect. This ticket wires the pi
  lifecycle to the right call.
- Today `disconnectRelay()` and the `session_shutdown` handler both call
  `client.disconnect()` (raw `ws.close()`). After 0003, that maps to
  partysocket's `close()` — but verify the deliberate-close flag survives, so a
  flaky close event right after a deliberate close doesn't kick off a retry loop.
- The web-app half of this is covered in 0002 (deliberate `close()` doesn't
  reconnect). Coordinate so both sides agree on what "shutdown" means.
- `/web-sync connect` after a shutdown must start a new connection: either call
  `reconnect()` on the existing partysocket, or recreate the client. Pick one
  and document it.

## Done when

- `/web-sync disconnect` closes the socket deliberately; no reconnect attempt
  follows; footer/widget/status cleared.
- `session_shutdown` (pi quit) does the same — the relay sees a clean close and
  frees the session slot (so the web app gets `peer_disconnected` for pi, not a
  zombie).
- A subsequent `/web-sync connect` re-establishes the connection successfully
  (full handshake + `sync_request`/`sync_response` works again).
- Test: trigger `session_shutdown`, assert no reconnect timer fires and the
  socket is closed.