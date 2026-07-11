---
id: 0003
title: "Adopt partysocket + reconnection in the extension"
type: task
parent: 0001
blocked_by: []
assigned: tan.yinloo
status: open
---

## Question

Replace the raw `WebSocket` in `packages/extension/relay-client.ts` (`RelayClient`)
with `partysocket` so the pi side auto-reconnects with backoff and exposes
retry progress to the extension UI.

## Context

- `RelayClient` wraps a single `WebSocket`; it has no `close`/`error` listeners
  after the initial connect, so a mid-session drop is invisible — `send()` just
  silently no-ops forever.
- `partysocket` needs a WebSocket constructor in Node: pass `WebSocket: WS` from
  the `ws` package (`packages/extension` already depends on it indirectly; add
  it explicitly if needed).
- `index.ts` calls `client.connect()` once in `connectRelay` and never reconnects.
  With partysocket, `connect()` creates the socket and reconnection is automatic;
  the extension just needs to keep the handlers attached across reconnects.
- Config must match ticket 0002.
- This ticket blocks clean shutdown (0005) and heartbeat (0006).

## Done when

- `RelayClient` uses a `partysocket` `WebSocket` internally; the `message`,
  `sync_request`, and `peer_disconnected` handlers survive reconnects (attach to
  the partysocket instance, not a one-shot socket).
- Accidental close triggers automatic reconnect with backoff; messages sent while
  down are buffered (`maxEnqueuedMessages`) and flushed on reconnect — verify an
  `assistant_delta`/`assistant_done` sent during an outage still arrives.
- The extension surfaces retry progress in the pi footer via
  `ctx.ui.setStatus("pi-web-sync", ...)`, e.g. `"Web sync: reconnecting (3/10)…"`
  using `retryCount`, and restores the session URL on success.
- On max retries exceeded: footer shows a failed state and the user can run
  `/web-sync connect` to try again (calls `reconnect()` or recreates — see 0005).
- `relay-client.test.ts` is updated: the mock must satisfy partysocket's usage;
  add a test that a buffered message is flushed after reconnect.

## Config (agree with ticket 0002)

```ts
{
  WebSocket: WS,                // from "ws"
  maxRetries: 10,
  minReconnectionDelay: 1000,
  maxReconnectionDelay: 30000,
  reconnectionDelayGrowFactor: 1.3,
  maxEnqueuedMessages: 100,
  connectionTimeout: 4000,
}
```