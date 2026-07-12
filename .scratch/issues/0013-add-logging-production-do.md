---
id: 0013
title: "Add logging to the production Durable Object relay"
type: task
parent: 0001
blocked_by: []
assigned: yinlootan
status: closed
---

## Question

The production Cloudflare Durable Object relay (`packages/relay/src/index.ts`)
has zero logging, unlike the dev relay. Add logging sufficient for a self-hoster
deploying the Worker to debug connection/disconnection and forwarding — in
whatever form works on Cloudflare (`console.log` surfaces in `wrangler tail`).

## Context

Surfaced by the verification pass
([report](../../docs/plans/verification-pass-0010.md), criterion 5) and noted in
ticket 0009's resolution.

- `grep -n "console\." packages/relay/src/index.ts` → **zero** logging
  statements. The dev relay (`relay-server.ts`) has 6 (listen-ready, per-client
  connect/disconnect with session ID + close code + active session count,
  forwarded byte counts at debug, errors).
- The README documents the Worker/DO as the production path ("Durable Objects
  are required for production"), so a self-hoster who deploys production gets a
  black box — no visibility via `wrangler tail`.
- The verification pass used the dev relay, so the DO path was not
  runtime-exercised; the zero-logging finding is code-confirmed. If adding
  logging, also exercise the DO locally (`wrangler dev`) to confirm the logs
  appear.
- **Runtime-confirmed (pass 0010b):** ran the production DO under `wrangler dev`
  and exercised every transport criterion (see
  [verification-do-0010b](../../docs/plans/verification-do-0010b.md)). `wrangler
  tail` showed only HTTP-level fetch logs (`GET /session/... 101`) and **zero**
  application output from the DO — confirming the black-box finding live, not
  just by code reading. (Pass 0010b also confirmed the DO is transport-parity
  with the dev relay on all other criteria — no DO-specific bug.)

**Scope note:** this is the production-DO observability gap that graduated from
the map's "Not yet specified" fog. It is the one ticket from the observability
criterion; the dev relay is already sufficiently logged, and the
extension/webapp surface connection state through their UIs (not graduated).

## Done when

- The DO logs connect/disconnect (with session id + close code), forwarding
  activity (debug), and errors — mirroring the dev relay's discipline where
  sensible, with the `[pi-web-sync]` prefix and level conventions from ticket
  0009.
- Verified via `wrangler dev` that the logs appear in `wrangler tail`.
- A note added to the README's self-host section that `wrangler tail` gives relay
  visibility.

## Resolution

Added logging to `packages/relay/src/index.ts` (`SessionDO`), mirroring the dev
relay's discipline from ticket 0009. Verified live under `wrangler dev` that
every log site appears in the console (which is what `wrangler tail` streams in
production).

**Logging sites added (all with `[pi-web-sync]` prefix):**

| Event | Level | Example output |
|---|---|---|
| Client connects | `log` | `pi connected to session test-sess` |
| Client disconnects | `log` | `web disconnected from session test-sess (code=1005, reason=)` |
| Duplicate web tab rejected | `warn` | `web rejected for session dup-sess — duplicate tab` |
| Message forwarded | `debug` | `forwarded 108 bytes: pi → web` |
| No paired client | `debug` | `no paired client for pi in session test-sess` |
| Socket error | `error` | `pi error in session test-sess: [Event]` |

**Structural change:** `sessionId` extraction moved to the top of `fetch()`
(was inline after the store block) so it's available for every log line. The
close handler now captures `CloseEvent.code` + `.reason` for the disconnect
log. The error handler captures the `Event` and passes it to `console.error`
(the Workers runtime does not provide `.message` on WebSocket error events like
Node's `ws` library does).

**Intentional difference from the dev relay:** the dev relay's connect log
includes `(${sessions.size} active sessions)` — omitted here because each DO
instance is one session, with no global session map to count from.

**Verification (live, under `wrangler dev --local --port 8799`):**
- Connected pi + web clients, sent a message, disconnected both → all five
  primary log sites appeared (`connected`, `forwarded … bytes`, `disconnected
  (code=…)`).
- Connected two web clients → `web rejected for session dup-sess — duplicate
  tab` appeared, second client closed with code 4002.
- `tsc --noEmit` clean; 7/7 existing relay tests pass (dev relay logging
  unchanged).

**README:** added a note in the self-host → Relay → Production section that
`wrangler tail` streams relay logs with the `[pi-web-sync]` prefix.

**Done-when criteria met:** DO logs connect/disconnect (session id + close
code) ✓, forwarding activity at debug ✓, errors ✓, `[pi-web-sync]` prefix +
level conventions from 0009 ✓, verified via `wrangler dev` ✓, README note ✓.
