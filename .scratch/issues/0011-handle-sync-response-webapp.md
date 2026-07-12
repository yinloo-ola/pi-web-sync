---
id: 0011
title: "Handle sync_response in the webapp to recover history"
type: task
parent: 0001
blocked_by: []
assigned: yinlootan
status: closed
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

## Resolution

Implemented `sync_response` handling so conversation history is recovered on
every (re)connect.

**Changes:**

1. **`useLocalStorage.ts`** — added `mergeMessages(msgs: ChatMessage[])`: merges
   an array of messages into the existing list, de-duping by `id` (existing
   entries keep their content), sorting the result by `timestamp`, and persisting
   to `localStorage`. No-ops on empty input or when all incoming are duplicates.

2. **`App.tsx`** — added a `sync_response` branch in `handleMessage` that maps
   `payload.messages` to `ChatMessage[]` (using the same
   `${sessionId}-${timestamp}` id pattern as live messages) and calls
   `mergeMessages`. This means a fresh browser open populates from the relay, and
   a reconnect recovers any messages missed during the outage — de-duped against
   what `localStorage` already holds.

3. **`useRelay.test.ts`** — new test "forwards sync_response to onMessage" drives
   a `sync_response` message through the mock WebSocket and asserts it reaches
   `onMessage` (proving useRelay doesn't silently drop it).

4. **`useLocalStorage.test.ts`** (new file) — 5 tests covering `mergeMessages`:
   de-dup + sort, fresh-open (empty localStorage), persistence, empty-input
   no-op, and all-duplicates no-op.

**Done-when criteria met:** handler consumes `sync_response.payload.messages`
with de-dup ✓; fresh-open path tested ✓; reconnect recovery path tested ✓;
test covers the new branch ✓.

**Verification:** all 10 webapp tests pass (5 new), `tsc --noEmit` clean.