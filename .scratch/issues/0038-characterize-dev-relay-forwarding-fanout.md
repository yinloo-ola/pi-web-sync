---
id: 0038
title: "Characterize the dev relay's forwarding, fanout, and close→notify"
type: task
parent: 0035
blocked_by: []
assigned: null
status: done
triage: ready-for-agent
---

# 0038 — Characterize the dev relay's forwarding, fanout, and close→notify

## What to build

Augment the existing real-WebSocket relay tests with the three policy behaviors
the audit found untested, so the current dev relay's behavior is locked before
`RelaySession` is extracted (ticket 0041). Cover: normal-message forwarding
(pi→web and web→pi, across message types), `peer_connected`/`peer_disconnected`
fanout on connect, and close→notify the other peer. Single-tab enforcement and
heartbeat are already covered and carry over. This is the audit's
characterization gate for candidate B.

## Acceptance criteria

- [x] Forwarding: a normal message sent by pi is received verbatim by web, and vice versa.
- [x] Fanout: on connect, the new client and the existing peer each receive the correct `peer_connected`/`peer_disconnected` message in the current ordering.
- [x] Close→notify: when one peer closes, the other receives `peer_disconnected`.
- [x] Tests pass against the current dev relay, locking its behavior.

## Blocked by

None — can start immediately. (Frontier ticket; gates 0041.)