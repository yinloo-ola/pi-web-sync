---
id: 0005
title: "Clean shutdown: disconnect and session_shutdown must not auto-reconnect"
type: task
parent: 0001
blocked_by: [0003]
assigned: null
status: open
---

## Question

Ensure `/web-sync disconnect` and quitting the pi session (`session_shutdown`)
fully tear down the connection and do **not** trigger auto-reconnect, and that
the next `/web-sync connect` starts fresh.

## Context

- `partysocket`'s `close()` is a deliberate close — it does NOT auto-reconnect.
  A connection that drops on its own DOES reconnect. This ticket wires the pi
  lifecycle to the right call.
- Today `disconnectRelay()` and the `session_shutdown` handler both call
  `client.disconnect()` (raw `ws.close()`). After 0003, that maps to
  partysocket's `close()` — but verify the deliberate-close flag survives, so a
  flaky close event right after a deliberate close doesn't kick off a retry loop.
- The web-app half of this is covered in 0002 (deliberate `close()` doesn't
  reconnect). Coordinate so both sides agree on what "shutdown" means.
- `/web-sync connect` after a shutdown must start a new connection: either call
  `reconnect()` on the existing partysocket, or recreate the client. Pick one
  and document it.

## Done when

- `/web-sync disconnect` closes the socket deliberately; no reconnect attempt
  follows; footer/widget/status cleared.
- `session_shutdown` (pi quit) does the same — the relay sees a clean close and
  frees the session slot (so the web app gets `peer_disconnected` for pi, not a
  zombie).
- A subsequent `/web-sync connect` re-establishes the connection successfully
  (full handshake + `sync_request`/`sync_response` works again).
- Test: trigger `session_shutdown`, assert no reconnect timer fires and the
  socket is closed.