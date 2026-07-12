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
- [Heartbeat / liveness: detect zombie connections](0006-heartbeat-liveness.md) — relay answers ping with pong directly (no peer forwarding); extension + webapp ping every 30s, reconnect on 10s pong timeout; DO hibernation not in play (non-hibernating API). 5 new tests, all pass.
- [Clean shutdown: disconnect and session_shutdown must not auto-reconnect](0005-clean-shutdown-semantics.md) — already correct from 0003/0004; fixed duplicate options bug in relay-client.ts, added 2 shutdown tests (10 total).
- [Stop swallowing errors: surface config and sync failures](0007-error-visibility.md) — four silent `catch {}` blocks replaced: config parse warns with file+error, sync_response warns, wire-message and QR render log at debug; `[pi-web-sync]` prefix convention established.
- [Shared types package + dead code cleanup](0008-shared-types-dead-code.md) — extension/types.ts is now the single source of truth for RelayMessage/MessageType; webapp imports from it; clearMessages removed; sessionId prop already gone.
- [Standardize logging across all three packages](0009-standardize-logging.md) — `[pi-web-sync]` prefix everywhere; level discipline (warn=actionable, debug=noise, error=genuine, log=lifecycle-only); stray `console.log` in App.tsx removed; noted production DO has zero logging (verification-pass candidate).
- [Verification pass: exercise the destination criteria](0010-verification-pass.md) — ran the system end-to-end (real relay + real `RelayClient` under jiti + real webapp in Chromium). Zombie detection, single-tab, clean shutdown, and reconnect+pi-leg buffering all PASS. Three gaps graduated: webapp doesn't handle `sync_response` (0011), webapp input locked during outage makes buffering UI-unreachable (0012), production DO has zero logging (0013). Destination not yet reached.
- [Verification pass 0010b: exercise the production Durable Object](../../docs/plans/verification-do-0010b.md) — ran the production Worker + `SessionDO` under `wrangler dev` against the real `RelayClient`. Transport-parity with the dev relay on every criterion (heartbeat, single-tab, clean shutdown, live forwarding, reconnect) — **no DO-specific bug**. Confirmed live that criterion 5 still fails for the DO (zero `wrangler tail` output), reinforcing 0013.
- [Handle sync_response in the webapp to recover history](0011-handle-sync-response-webapp.md) — App.tsx now consumes `sync_response.payload.messages` via a new `mergeMessages` (de-dup by id, sort by timestamp); fresh-open and reconnect both recover history. 5 new tests, all pass.
- [Webapp input locked during outage — keep it locked](0012-webapp-input-locked-during-outage.md) — decided NOT to expose partysocket's send-buffering via the UI; input stays disabled until `connected` + pi present. 0002's buffering kept as a race-safety net (not dead code to remove). Disconnect-survival still met: pi→webapp buffers+flushes, webapp→pi simply doesn't send mid-outage; history recovers via `sync_response` (0011).

## Not yet specified

<!-- fog: in-scope decisions not yet sharp enough to ticket -->

<!-- fog cleared: DO hibernation dissolved (finding lives in ticket 0006's
     resolution); observability graduated into ticket 0009; the
     verification-driven fog (incl. the DO-logging question) graduated into
     tickets 0011-0013 via the 0010 verification pass. -->

The verification pass (ticket 0010) cleared the fog ahead of it. The way to the
destination is now visible modulo one remaining open ticket: **0013** (production
DO logging). No new fog surfaced across 0011–0012. Once 0013 closes, all
verification gaps are addressed and the destination should be reached.

## Out of scope

<!-- work consciously ruled out of this effort -->

- **Multi-browser-tab sync.** One browser tab per session; extras are rejected
  (ticket 0004). Not graduating to fan-out/broadcast.
- **Message-level ACKs / guaranteed (at-least-once) delivery.** At-most-once is
  fine for chat sync; `sync_response` on reconnect covers history recovery.
- **Relay authentication and rate limiting.** Each user self-hosts their own
  relay; the session-ID-as-secret (ADR-002) is sufficient for now.
- **WebRTC migration.** Ruled out by ADR-001 (WebSocket relay).