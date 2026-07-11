---
id: 0001
title: "pi-web-sync production hardening"
type: map
parent: null
blocked_by: []
assigned: null
status: open
---

# pi-web-sync production hardening

## Destination

pi-web-sync is robust enough for others to self-host and use reliably for their
own pi sessions: it survives network disconnects without losing messages, detects
zombie connections, enforces a single browser tab per session, and shuts down
cleanly when the user disconnects or quits pi.

## Notes

- **Domain:** pi-web-sync — a pi extension + WebSocket relay (Cloudflare Worker /
  Durable Object, plus a Node dev relay) + React web app that syncs a live pi
  session to the browser in real time.
- **Three packages:** `packages/extension` (pi plugin, Node), `packages/relay`
  (CF Worker + DO, and `relay-server.ts` Node dev relay), `packages/webapp`
  (React + Vite).
- **Skills every session should consult:** `/grilling`, `/domain-modeling` for
  decisions; `/tdd` and `/implement` for execution (this effort carries
  execution into the map — see below).
- **Standing preferences:**
  - Prefer mature libraries over reinventing (see decision: partysocket).
  - Tests live in each package (`npx vitest`); add tests for new behavior.
  - `RelayMessage` types must not drift across packages.
- **Tracker:** local markdown under `.scratch/issues/` — see
  `docs/agents/issue-tracker.md`.
- **Execution in the map:** unlike a pure decision map, this effort's tickets are
  mostly TASK type — the destination is a change made in place. Resolving a
  ticket means implementing it and recording what was done.

## Decisions so far

<!-- one line per closed ticket: gist + link. Empty until the first ticket closes. -->

- [Adopt partysocket + reconnection in the web app](0002-adopt-partysocket-webapp.md) — webapp now uses partysocket: auto-reconnect on accidental close, message buffering while down (send no longer drops on disconnect), and a reconnecting/failed UI with a manual Reconnect button; failure detection mirrors partysocket's minUptime rather than reading retryCount.
- [Enforce a single browser tab at the relay](0004-enforce-single-browser-relay.md) — both relays close a second web client with code 4002; web app shows "already open in another tab" and doesn't reconnect. Clean closes tracked via close-listener + isOpen; zombies deferred to 0006. Drive-by fixed the relay's READY_STATE_OPEN tsc errors.
- [Adopt partysocket + reconnection in the extension](0003-adopt-partysocket-extension.md) — RelayClient wraps partysocket (WebSocket: WS); handlers survive reconnects, sends buffer while down, and onStatus drives the pi footer (connected URL / reconnecting (N/10) / failed). /web-sync connect retries after a mid-session failure.

## Not yet specified

<!-- fog: in-scope decisions not yet sharp enough to ticket -->

- **Durable Object hibernation vs heartbeat.** Cloudflare DOs can hibernate idle
  WebSocket connections. Whether the app-level heartbeat (ticket 0006) interacts
  with DO hibernation, or whether hibernation makes heartbeat unnecessary on the
  relay leg, needs a look once 0006 is in flight. May graduate into a ticket or
  dissolve.
- **Observability beyond `console.warn`.** How much logging is enough for a
  self-hoster debugging a flaky relay? Likely settles during 0007; could become
  its own small ticket if it grows.

## Out of scope

<!-- work consciously ruled out of this effort -->

- **Multi-browser-tab sync.** One browser tab per session; extras are rejected
  (ticket 0004). Not graduating to fan-out/broadcast.
- **Message-level ACKs / guaranteed (at-least-once) delivery.** At-most-once is
  fine for chat sync; `sync_response` on reconnect covers history recovery.
- **Relay authentication and rate limiting.** Each user self-hosts their own
  relay; the session-ID-as-secret (ADR-002) is sufficient for now.
- **WebRTC migration.** Ruled out by ADR-001 (WebSocket relay).