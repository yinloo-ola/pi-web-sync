---
id: 0032
title: "Relay policy: the transport-agnostic seam"
type: grilling
parent: 0028
blocked_by: [0029, 0034]
assigned: yinlootan
status: closed
triage: ready-for-human
---

# 0032 — Relay policy: the transport-agnostic seam (candidate B)

## Question

What is the transport-agnostic seam, and what does each side own?

## Context

The riskiest deepening. `packages/relay/src/relay-server.ts` (dev, Node `ws`,
~137 lines) and `packages/relay/src/index.ts` (prod, `SessionDO` Durable Object,
~166 lines) inline the **same** relay policy: parse `/session/:id`, validate
`?client=pi|web`, enforce the single-browser-tab rule (reject a 2nd web with
`CLOSE_DUPLICATE_WEB`), fan out `peer_connected`/`peer_disconnected`, forward
messages to the other peer, and intercept `ping`/`pong`. They differ only in
transport. The dev relay is tested (7 tests); the DO is not — so production can
silently drift. This is two adapters with no deep module behind them.

**Recommended answer:**

- Extract a `RelaySession` policy that operates on an abstract socket shape
  (something like `{ send, close, onMessage, onClose }` + an `isOpen` probe),
  holding the two slots (pi/web) and encoding single-tab enforcement, peer
  fanout, forward-to-other, and heartbeat interception once.
- **Policy owns:** single-tab rule, peer-status fanout, forwarding, ping/pong
  interception.
- **Adapter owns:** session *keying* — dev: a `Map<sessionId, RelaySession>`;
  prod: DO `idFromName(sessionId)` + `WebSocketPair` accept + storage. The DO's
  lifecycle wraps exactly one `RelaySession`.
- Design the seam to be **testable via a fake adapter** (see 0033).

**Refactor safety (see map Notes):** the resolution must specify the
characterization coverage — the dev relay's existing 7 tests must be augmented
to **fully characterize the policy** (single-tab ordering, peer-notify ordering,
forward, heartbeat) *before* extraction, then **re-run unchanged against the
extracted `RelaySession`** to prove behavior preservation. **Blocked by the
audit (0034)** so the baseline is known first. (Close-code / URL-parsing types
move per ticket 0029.)

## Resolution

**Chosen: extract `RelaySession` behind a transport-agnostic `RelaySocket` seam; same-type-replace adopts the dev behavior (i).** Recorded as [ADR-005 — Relay policy: one RelaySession behind a transport-agnostic socket seam](../../docs/plans/completed/adr/005-relay-policy-seam.md).

**Seam:**
- `RelaySession` class in `packages/relay/src/relay-session.ts` (the **relay** package, not protocol — it's relay behavior). Holds pi/web `RelaySocket` slots.
- `RelaySocket` interface — `{ send, close, isOpen, onMessage, onClose }`, implemented by each adapter from its platform WebSocket. This is the fake-able test surface for ticket 0033.

**Policy (`RelaySession`) owns:** single-web-tab enforcement (`CLOSE_DUPLICATE_WEB`), slot store/replace/close, `peer_connected`/`peer_disconnected` fanout, message forwarding, ping/pong interception. Consumes the protocol package's message types + close codes.

**Adapter owns:** session keying (dev `Map<sessionId, RelaySession>`; DO one instance via `idFromName`), WebSocket acquisition (`ws` server vs `WebSocketPair`+`accept`), URL/`?client=` validation, wiring platform events onto `RelaySocket`, cleanup (`map.delete` vs DO eviction).

**Same-type-replace divergence — resolved (i):** adopt the dev behavior — when a new `pi` connects while the old `pi` socket is open, notify the old socket (`peer_disconnected`) before closing/replacing. The DO changes to match. Keeps B a behavior-preserving refactor of the characterized (tested) dev relay; the DO was untested so nothing characterized is lost. The notify is arguably noise to a dying socket — kept deliberately (a future cleanup can drop it as a separate behavior change).

**Refactor-safety gate (per audit 0034):** characterize the dev relay's **forwarding + peer-fanout + close→notify** (the three untested policy behaviors) *before* extraction; require those assertions to pass **unchanged** against the extracted `RelaySession`. Existing single-tab + heartbeat + `isOpen` tests carry over directly.

**Single-web-tab policy preserved** (the user-visible behavior): 2nd web rejected while the 1st is `OPEN`; accepted (replaces) once the 1st is closed. A half-open zombie 1st tab still blocks until TCP timeout — **relay-side zombie detection is out of scope** (recorded on the map; a behavior change/feature for its own effort).

**ADR-005 created.** Resolving this unblocks **0033** (production-DO test strategy). No new tickets; the implementation/migration fog stays (separate effort); no other out-of-scope rulings beyond the zombie-probe note.