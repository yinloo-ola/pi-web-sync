---
id: 0006
title: "Heartbeat / liveness: detect zombie connections"
type: task
parent: 0001
blocked_by: [0002, 0003]
assigned: tan.yinloo
status: closed

## Resolution

### Design decision: relay responds to ping directly (no peer forwarding)

The *other* option (relay forwards ping/pong between peers) would cause a
false zombie alarm when a client has no peer (e.g. web app open but pi not
connected) — the client pings, no peer exists to pong, so every 30s the
client would reconnect-loop forever.  Therefore the relay answers each
client's `ping` with an immediate `pong` **directly**, testing each leg of
the connection independently of peer presence.

### What changed

**Types** (`extension/types.ts`, `webapp/src/types.ts`):
  - Added `"ping" | "pong"` to `MessageType`.

**Relays** (`relay-server.ts`, `index.ts`):
  - On receiving a `ping` from a client, the relay sends a `pong` back to
    THAT client and does NOT forward the message to the peer.
  - `pong` messages received by the relay are silently dropped (defensive;
    clients never send pong).

**Extension client** (`relay-client.ts`):
  - Every 30s sends `{ type: "ping", sessionId, payload: {} }`.
  - Sets a 10s pong timeout; on expiry calls `reconnect()` which forces
    partysocket to re-establish (surfacing reconnecting/failed via onStatus).
  - A `pong` in the message stream clears the pending timeout (not forwarded
    to the message handler).
  - Heartbeat intervals are configurable via `RelayClientOptions.heartbeat`
    (the constructor option), enabling short intervals in tests.
  - Timers are cleaned up on close, disconnect, reconnect, and unmount.

**Web app** (`useRelay.ts`):
  - Identical heartbeat logic via the same 30s ping / 10s pong timeout.
  - The pong-timeout callback uses a `reconnectRef` to call the `reconnect`
    useCallback without creating a circular dependency.
  - Timers cleaned up on close, reconnect, and effect teardown.

### Hibernation fog resolved

The current DO (`index.ts`) uses the **non-hibernating** WebSocket API
(`server.accept()`).  Hibernation is therefore not in play today — the DO
stays alive while connections are open regardless of heartbeat.

If the DO is later migrated to the hibernating API
(`state.acceptWebSocket(ws)` with `webSocketMessage`/`webSocketClose`
handlers), the 30s app-level ping would wake it every 30s, defeating
hibernation savings.  Cloudflare provides
`ctx.state.setWebSocketAutoResponse()` to handle **protocol-level** pings
without waking the DO — but the browser can't send protocol pings, so the
browser leg would still need app-level ping/pong regardless.  The net: no
follow-up ticket needed; just a documented trade-off for the hibernation
path.

### Tests

| Package | Tests |
|---------|-------|
| `relay` | 1 new heartbeat test: relay answers `ping` with `pong` and does not forward it to peer (both directions) |
| `extension` | 2 new heartbeat tests: (a) ping send + pong clears timeout; (b) missed-pong triggers reconnect |
| `webapp` | 2 new heartbeat tests: (a) missed-pong → reconnect (fake timers); (b) pong received → no reconnect (fake timers) |

All 19 tests pass (7 relay + 8 extension + 4 webapp), zero regressions.
---

## Question

Add an app-level ping/pong heartbeat so both sides detect half-open (zombie)
connections and close them, which then triggers partysocket to reconnect.

## Context

- Without liveness probes, a TCP half-open leaves the UI showing "Connected"
  while messages vanish — debugging nightmare.
- The browser WebSocket API does not expose protocol-level ping/pong, so use an
  **app-level** message pair that works everywhere (browser, Node, Cloudflare
  DO). Add `ping` and `pong` to the `MessageType` union in both type files (see
  also 0008 for de-duping the type).
- Add new message types: `{ type: "ping" }` and `{ type: "pong" }`. Each client
  sends a `ping` every 30s; if no `pong` arrives within 10s, close the socket
  (partysocket then reconnects). The relay forwards ping/pong between peers, or
  responds directly — decide and document which.
- **Fog to resolve here:** Cloudflare DOs can hibernate idle WebSockets. Check
  whether the heartbeat interacts with DO hibernation (e.g. keeps the DO awake,
  which may cost money) or whether hibernation already gives liveness for free
  on the relay leg. Note the finding in the resolution; graduate a follow-up
  ticket if needed.

## Done when

- `ping`/`pong` message types defined and forwarded by both relays.
- Each side (extension and web app) pings every 30s and closes on a 10s pong
  timeout; partysocket then reconnects.
- The local dev relay (`relay-server.ts`) and the DO (`index.ts`) both handle
  ping/pong (forward or respond). If a relay-side idle cleanup is warranted, add
  it.
- DO-hibernation finding recorded in the resolution.
- Test: simulate a missed pong and assert the socket closes + reconnect fires.