---
id: 0011
title: "Handle sync_response in the webapp to recover history"
type: task
parent: 0001
blocked_by: []
assigned: null
status: open
---

## Question

The webapp sends `sync_request` on every (re)connect but never handles the
`sync_response` reply — implement a handler so conversation history is recovered
on connect/reconnect.

## Context

Surfaced by the verification pass
([report](../../docs/plans/verification-pass-0010.md), criterion 1).

- `useRelay.ts:138` sends `sync_request` on open. The pi leg replies with
  `sync_response` (verified live: pi-leg log `sync_request -> sent sync_response
  (2 history msgs)`).
- `grep -rn "sync_response" packages/webapp/src/` → **zero matches**. `useRelay`
  forwards `sync_response` to `handleMessage` in `App.tsx`, which branches only on
  `user_message` / `assistant_delta` / `assistant_done` — so `sync_response` is
  silently dropped.
- Confirmed empirically: after connect, browser `localStorage` was `{}` and the
  history messages never rendered.

**Impact:** a fresh browser open shows an empty conversation even when pi holds
history; and there is no safety net for messages lost when the two legs reconnect
asymmetrically (the pi leg flushes its buffer while the webapp isn't yet
connected → the relay drops the forward). Both are part of the destination
("survives network disconnects without losing messages" / "self-host and use
reliably").

## Done when

- `App.tsx` (or `useRelay`) consumes `sync_response.payload.messages` and
  populates the message list (de-duping against `localStorage` entries by id).
- On a fresh browser open (cleared `localStorage`) to a session with pi-side
  history, the conversation renders from `sync_response`.
- On reconnect after an outage, history is recovered.
- A test covers the new branch (the existing `useRelay.test.ts` mock framework
  can drive a `sync_response` message).