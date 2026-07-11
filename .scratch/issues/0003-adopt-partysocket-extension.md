---
id: 0003
title: "Adopt partysocket + reconnection in the extension"
type: task
parent: 0001
blocked_by: []
assigned: tan.yinloo
status: closed
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

## Resolution

RelayClient now wraps a partysocket WebSocket, mirroring the web app (ticket
0002) but with `WebSocket: WS` from the `ws` package for Node.

### What changed

- **`relay-client.ts`** — constructs a partysocket `WebSocket` with the agreed
  config. Handlers (`message`, `sync_request`) attach to the persistent
  partysocket **instance**, so they survive reconnects — the core fix; the old
  code attached them to a one-shot raw socket, so a mid-session drop left
  `send()` silently no-op'ing forever. `send()` now always hands off to
  partysocket, which buffers up to `maxEnqueuedMessages` while down. New
  `onStatus(state, attempt)` drives the footer; `reconnect()` supports retrying
  after failure.
- **`index.ts`** — `connectRelay` registers `onStatus` before `connect()` so the
  footer shows the connected URL, `Web sync: reconnecting (N/10)…`, or a failed
  state. `/web-sync connect` after a mid-session failure calls `client.reconnect()`
  instead of "already connected". Disconnect and shutdown reset the state.
- **`package.json`** — `ws` added to deps (partysocket/`@types/ws` were already
  staged from the prior session).
- **`relay-client.test.ts`** — rewritten around an injected `MockWebSocket`
  (passed via `RelayClientOptions.WebSocket`, since partysocket wraps the ctor
  from options rather than a global): connect, buffering-then-flush, message
  routing (sync_request routed, peer_disconnected dropped), status, disconnect.

### Decision (A): connect() semantics

`connect()` resolves on first open and rejects on first error, so an explicit
`/web-sync connect` to an unreachable relay fails fast (current UX preserved).
Mid-session drops then retry via partysocket, surfaced through `onStatus`. The
alternative (retry visibly even on initial connect) was rejected as a larger UX
change; both paths still let the user retry.

### Notes

- `minUptime: 5000` set explicitly (partysocket's default, which the agreed
  config block omitted), matching ticket 0002 — failure detection mirrors
  partysocket's internal `_acceptOpen` via our own close counter rather than the
  ambiguous `retryCount`.
- The prior session left uncommitted QR-auto-dismiss work in `index.ts` plus the
  partysocket/`@types/ws` deps; the QR feature was committed separately (c9d7541)
  and 0003 built on the deps without touching the QR code.

### Verification

- `vitest run`: 6/6 (connect open/error, buffering, message routing, status,
  disconnect).
- `tsc --noEmit`: no new errors (extension's 8 pre-existing — implicit-any on
  handler params + the missing pi-sdk module import — are unchanged and out of
  scope).