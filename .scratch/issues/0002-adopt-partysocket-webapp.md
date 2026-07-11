---
id: 0002
title: "Adopt partysocket + reconnection in the web app"
type: task
parent: 0001
blocked_by: []
assigned: tan.yinloo
status: closed
---

## Question

Replace the raw `WebSocket` in `packages/webapp/src/hooks/useRelay.ts` with
`partysocket` so the web app auto-reconnects with backoff, buffers messages
while disconnected, and exposes reconnection state to the UI.

## Context

- `useRelay.ts` currently calls `new WebSocket(...)` once on mount, has a dead
  `reconnect()` that nothing calls, and silently drops messages while down.
- `partysocket` (npm, maintained by Cloudflare; fork of reconnecting-websocket)
  is WebSocket-API-compatible and works in the browser with no polyfill. It
  provides auto-reconnect, exponential backoff with jitter, `maxRetries`,
  `maxEnqueuedMessages` (buffering), and a `retryCount` attribute.
- See map decision: partysocket for both sides. Config values are shared with
  ticket 0003 — keep them consistent.

## Done when

- `useRelay.ts` constructs a `partysocket` `WebSocket` instead of the raw one.
- Reconnection is automatic on accidental close (network drop); a deliberate
  `close()` does NOT reconnect (this is the web-app half of clean shutdown,
  ticket 0005 — coordinate so the behavior matches).
- Outgoing messages are buffered while disconnected (`maxEnqueuedMessages`) and
  flushed on reconnect — verify typed messages during an outage still arrive.
- The `sync_request` on `open` still fires (existing behavior) so reconnect
  recovers full history.
- `Chat.tsx` surfaces connection state to the user:
  - while reconnecting: show "Reconnecting… (attempt N)" using `retryCount`
  - on max retries exceeded: show a persistent "Connection failed" state with a
    manual **Reconnect** button that calls `reconnect()`
- Existing tests still pass; add a test for buffered-then-flushed send.

## Config (agree with ticket 0003)

```ts
{
  maxRetries: 10,
  minReconnectionDelay: 1000,   // partysocket adds its own jitter
  maxReconnectionDelay: 30000,
  reconnectionDelayGrowFactor: 1.3, // default
  maxEnqueuedMessages: 100,
  connectionTimeout: 4000,      // default
}
```

## Resolution

Adopted `partysocket` in the web app and wired reconnection + buffering +
failure UI. Stood up vitest/jsdom in the webapp to satisfy the "add a test"
done-when (the map's stated convention is per-package vitest, but webapp had
none).

### What changed (all under `packages/webapp/`)

- `src/hooks/useRelay.ts` — constructs a `partysocket` `WebSocket` with the
  agreed config (matches 0003). Auto-reconnects on accidental close; the
  deliberate `close()` on unmount does not reconnect (web-app half of 0005).
- **Buffering fix (the crux)** — `send()` no longer guards on
  `readyState === OPEN` (which silently dropped messages while down). It now
  always hands the message to partysocket, which buffers up to
  `maxEnqueuedMessages` and flushes before the next `open`. `sync_request` still
  fires on every (re)open, so reconnect recovers full history.
- **Reconnect UI** — `RelayState` is now `connecting | connected | reconnecting
  | failed`. `Chat.tsx` shows "Reconnecting… (attempt N)" while retrying and a
  persistent "Connection failed" banner with a manual **Reconnect** button on
  terminal failure. `App.tsx` threads `retryAttempt` + `reconnect` through.
- `src/hooks/useRelay.test.ts` + `vitest.config.ts` — vitest in webapp; the test
  asserts a message sent while CONNECTING is buffered and flushed on open, with
  `sync_request` following.

### Decisions worth recording

- **Terminal-failure detection does NOT read `ws.retryCount`.** partysocket
  emits no distinct "gave up" event, and at the boundary the close that
  schedules the final retry and the close that gives up both report
  `retryCount === maxRetries` — ambiguous. Instead the hook tracks its own
  close-counter, reset only after the connection stays open `minUptime`
  (mirroring partysocket's internal `_acceptOpen`), and declares "failed" when
  the counter exceeds `maxRetries`. Without the `minUptime` mirror, a half-open
  socket that opens briefly then drops would reset on every open and never reach
  "failed" — exactly the zombie case this effort targets.
- **`minUptime` set explicitly to 5000** (partysocket's default, which the
  agreed config block omitted). 0003 currently relies on the same default, so
  the two sides match today — but 0003 should set `minUptime` explicitly too so
  a future partysocket default change can't drift them.
- `ws.reconnect()` dispatches a synchronous synthetic close; the hook ignores it
  via an intentional-close flag so clicking Reconnect isn't mistaken for an
  accidental drop.

### Verification

- `tsc --noEmit`: no webapp errors.
- `vitest run`: 1/1 passing (buffered-then-flushed send).
- `vite build`: 289 modules; partysocket bundles cleanly (315 KB / 98 KB gzip).

### Side-finding (not addressed — judged out of this ticket's scope)

The root `tsconfig.json` uses `"include": ["packages/**/*"]`, so `tsc` from any
package compiles all three. Pre-existing errors in `relay/src/index.ts`
(`READY_STATE_OPEN`) and the in-flight 0003 errors in `extension/index.ts` then
surface in every package's typecheck/build. Not caused by this ticket; flagged
in case it deserves its own ticket.