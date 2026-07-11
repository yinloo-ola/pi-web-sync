---
id: 0010
title: "Verification pass: exercise the destination criteria"
type: task
parent: 0001
blocked_by: []
assigned: yinlootan
status: closed
---

## Question

Has pi-web-sync met the production-hardening destination — surviving disconnects
without losing messages, detecting zombies, enforcing a single browser tab, and
shutting down cleanly — and if not, what concrete gaps remain?

## Context

The destination (from the map) is: *"robust enough for others to self-host and
use reliably — survives network disconnects without losing messages, detects
zombie connections, enforces a single browser tab per session, and shuts down
cleanly when the user disconnects or quits pi."* Tickets 0002–0009 implemented
the pieces; this pass exercises them as a running system rather than reading
code. Gaps found here graduate immediately as sharp tickets. If none are found,
the map's destination is reached and the effort closes.

**Setup:** dev relay (`npx tsx packages/relay/src/relay-server.ts`), pi with the
extension (`/web-sync connect`), webapp open in a browser. The browser leg can
be driven via the `agent-browser` skill or observed manually (HITL); the relay
and extension legs are AFK.

## Verification plan

For each criterion: trigger the condition, observe, record pass/fail with
evidence. Capture a markdown report as a linked asset.

**1. Disconnect survival + message buffering (tickets 0002, 0003)**
- Send a few messages both ways; confirm live sync.
- Kill the relay process mid-session (simulates relay/network failure).
- While down: send messages from pi *and* from webapp.
- Restart the relay.
- **Pass:** both sides show reconnecting → connected; messages sent during the
  outage flush through (no drops); `sync_response` recovers history on the
  webapp side. **Fail:** any message lost, or either side stuck in a
  non-reconnecting state.

**2. Zombie detection (ticket 0006)**
- Suspend the relay process (`kill -STOP <pid>`) so the TCP connection stays
  open but no `pong` returns — a true half-open, no close frame.
- **Pass:** within ~40s (30s ping interval + 10s pong timeout) the client shows
  reconnecting, then reconnects after the relay resumes (`kill -CONT`).
  **Fail:** client stuck on "Connected" with messages vanishing, or reconnect
  never fires.

**3. Single browser tab (ticket 0004)**
- Open a second browser tab to the same session URL.
- **Pass:** second tab rejected with code 4002, shows "already open in another
  tab" / Rejected status, and does *not* reconnect-loop. Then close the first
  tab and open a new one — it's accepted (stale slot replaced). **Fail:** second
  tab connects (duplicate), or rejected tab hammers reconnect.

**4. Clean shutdown (ticket 0005)**
- `/web-sync disconnect`: relay sees the close and cleans up the session; no
  auto-reconnect; footer clears; QR widget dismissed.
- Quit pi (`session_shutdown`): same clean teardown, no orphaned timers, no
  reconnect attempt.
- **Pass:** no reconnect, relay session removed, no leaked timers. **Fail:**
  auto-reconnect fires after disconnect/shutdown, or session leaks on the relay.

**5. Observability — cross-cutting (fog)**
- During the above, judge whether the `[pi-web-sync]` logs are sufficient for a
  self-hoster to debug each failure mode.
- Evaluate the production-DO logging gap (noted in 0009): this pass uses the dev
  relay, so the DO path is unexercised — record that as a finding (the DO's
  zero-logging may matter for self-hosters who deploy the Worker, not the dev
  relay).

## Done when

- A verification report (markdown, linked as an asset) records pass/fail per
  criterion with evidence.
- Each failing criterion becomes a new sharp ticket (graduate from fog); the
  map's Not-yet-specified is updated to reflect what graduated.
- If all four pass: record a destination-reached verdict on the map and close
  the effort.
- The observability finding is either resolved (sufficient) or graduates a
  ticket (insufficient).

## Resolution

Verification report: [docs/plans/verification-pass-0010.md](../../docs/plans/verification-pass-0010.md).

Exercised the destination criteria as a running system (real dev relay + the
real `RelayClient` under jiti + real webapp in Chromium via `agent-browser`).

**Pass:** zombie detection (criterion 2 — half-open detected in ~40 s via
missed pong, recovers on resume); single browser tab (criterion 3 — second tab
rejected 4002, no reconnect-loop, stale slot replaced after close); clean
shutdown (criterion 4 — no auto-reconnect, relay socket closed, no leaked
timers at 40 s, relay sees code-1000 close); and the reconnect + pi-leg
buffering half of criterion 1 (brief outage, buffered message flushed through).

**Fail / gaps — three tickets graduated:**

- [Handle `sync_response` in the webapp to recover history](0011-handle-sync-response-webapp.md)
  — the webapp sends `sync_request` but has zero handling for the
  `sync_response` reply; history recovery is broken (criterion 1 sub-fail).
- [Webapp input locked during outage](0012-webapp-input-locked-during-outage.md)
  — `Chat.tsx` disables the input while not `connected`, so the partysocket
  buffering (ticket 0002) is unreachable from the UI; users can't send during
  an outage (criterion 1 sub-fail).
- [Add logging to the production Durable Object relay](0013-add-logging-production-do.md)
  — `packages/relay/src/index.ts` has zero logging; production self-hosters
  get no `wrangler tail` visibility (criterion 5 gap; graduated from fog).

**Verdict:** destination **not yet reached** — criterion 1's history-recovery
sub-criterion and the webapp buffering UX are open, and the production DO is a
black box. The effort stays open for 0011–0013.