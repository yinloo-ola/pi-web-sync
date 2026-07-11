---
id: 0006
title: "Heartbeat / liveness: detect zombie connections"
type: task
parent: 0001
blocked_by: [0002, 0003]
assigned: null
status: open
---

## Question

Add an app-level ping/pong heartbeat so both sides detect half-open (zombie)
connections and close them, which then triggers partysocket to reconnect.

## Context

- Without liveness probes, a TCP half-open leaves the UI showing "Connected"
  while messages vanish — debugging nightmare.
- The browser WebSocket API does not expose protocol-level ping/pong, so use an
  **app-level** message pair that works everywhere (browser, Node, Cloudflare
  DO). Add `ping` and `pong` to the `MessageType` union in both type files (see
  also 0008 for de-duping the type).
- Add new message types: `{ type: "ping" }` and `{ type: "pong" }`. Each client
  sends a `ping` every 30s; if no `pong` arrives within 10s, close the socket
  (partysocket then reconnects). The relay forwards ping/pong between peers, or
  responds directly — decide and document which.
- **Fog to resolve here:** Cloudflare DOs can hibernate idle WebSockets. Check
  whether the heartbeat interacts with DO hibernation (e.g. keeps the DO awake,
  which may cost money) or whether hibernation already gives liveness for free
  on the relay leg. Note the finding in the resolution; graduate a follow-up
  ticket if needed.

## Done when

- `ping`/`pong` message types defined and forwarded by both relays.
- Each side (extension and web app) pings every 30s and closes on a 10s pong
  timeout; partysocket then reconnects.
- The local dev relay (`relay-server.ts`) and the DO (`index.ts`) both handle
  ping/pong (forward or respond). If a relay-side idle cleanup is warranted, add
  it.
- DO-hibernation finding recorded in the resolution.
- Test: simulate a missed pong and assert the socket closes + reconnect fires.