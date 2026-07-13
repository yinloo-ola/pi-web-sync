---
id: 0041
title: "Extract RelaySession behind the RelaySocket seam"
type: task
parent: 0035
blocked_by: [0036, 0038]
assigned: null
status: done
triage: ready-for-agent
---

# 0041 — Extract RelaySession behind the RelaySocket seam

## What to build

Extract the duplicated relay policy into one `RelaySession` module operating on
a transport-agnostic `RelaySocket` interface (shape per spec 0035 / ADR-005).
`RelaySession` owns single-web-tab enforcement, slot store/replace/close,
peer-status fanout, message forwarding, and ping/pong interception, consuming the
protocol package's message types and close codes. The dev relay becomes a thin
adapter that owns session keying, WebSocket acquisition, URL/client validation,
and cleanup. The ticket-0038 characterization passes **unchanged** against
`RelaySession`. Resolve the same-type-replace divergence by adopting the dev
relay's behavior (notify the old socket before replacing); the single-web-tab
policy is preserved exactly.

## Acceptance criteria

- [x] `RelaySession` and the `RelaySocket` interface exist; the dev relay is a thin adapter over them.
- [x] The policy (single-tab, fanout, forward, heartbeat interception) lives once in `RelaySession`.
- [x] Ticket 0038's characterization passes unchanged against `RelaySession`.
- [x] Same-type-replace adopts the dev behavior (notify old socket before close); single-web-tab policy preserved (2nd web rejected while 1st open, replaces once closed).
- [x] All existing relay tests stay green.

## Blocked by

- 0036 — Stand up the protocol package (types + close codes)
- 0038 — Characterize the dev relay's forwarding, fanout, and close→notify

> Note: this ticket and 0039 both touch the dev relay (restructuring vs. URL
> parsing). No hard dependency between them — coordinate merge order.