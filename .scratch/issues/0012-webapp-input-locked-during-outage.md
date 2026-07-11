---
id: 0012
title: "Webapp input locked during outage — decide whether to allow sending-while-disconnected"
type: task
parent: 0001
blocked_by: []
assigned: null
status: open
---

## Question

The webapp disables the message input whenever the relay isn't `connected`,
which makes the partysocket message buffering added in ticket 0002 unreachable
from the UI. Decide whether to allow sending-while-disconnected (buffer + flush)
or keep the input locked — and implement the decision.

## Context

Surfaced by the verification pass
([report](../../docs/plans/verification-pass-0010.md), criterion 1).

- `Chat.tsx`: `canSend = connectionState === "connected" && piStatus !==
  "disconnected"`, with `disabled={!canSend}` on the input. So during
  `connecting` / `reconnecting` / `failed` / `rejected`, the input is disabled
  (`disabled: true`, placeholder "Waiting for relay connection…").
- A user therefore **cannot send a message during an outage**. The transport
  layer buffers fine (`useRelay.send` always hands to partysocket, which buffers
  up to `maxEnqueuedMessages` and flushes on open — proven by unit test), but the
  UI never calls `send` while disconnected. Ticket 0002's buffering is dead code
  from the UI's perspective.
- The verification pass could only exercise the pi-leg→webapp buffered flush
  (which works: `buffered-pi-1b` reached the browser after a brief outage). The
  webapp→pi-leg direction could not be exercised because the input was locked.

**Tension:** disabling the input prevents users from sending messages that might
not deliver; enabling it leverages the buffering so users can keep working
through a brief outage. The destination ("survives network disconnects without
losing messages") implies users should be able to send through an outage and have
it buffer — but that only works if the input is enabled.

## Done when

- A decision is recorded: allow sending-while-disconnected (with a visible
  "sending…" / buffered indicator) **or** keep the input locked and document that
  buffering is intentionally UI-blocked (downgrade/remove the dead buffering, or
  keep it for the programmatic path).
- If "allow": implement it — input enabled during `reconnecting`, sends buffer
  and flush on reconnect, with UI affordance; add a test.
- If "keep locked": close this ticket with the rationale and note whether ticket
  0002's buffering should be revisited.