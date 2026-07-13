---
id: 0045
title: "Deduplicate messages after history sync"
type: task
parent: 0043
blocked_by: []
assigned: null
status: open
triage: ready-for-agent
---

# 0045 — Deduplicate messages after history sync

## Question

Why do messages sometimes appear twice in the webapp after a reconnect or page refresh, and how should we prevent it without adding server-side message IDs?

## Resolution

(TBD on close)

## Problem

The webapp builds message IDs from the relay timestamp (`${sessionId}-${timestamp}`). After a reconnect, `sync_response` returns the same message with a timestamp that may differ from the local optimistic timestamp, so `mergeMessages` treats it as a new message and the same text appears twice.

This also affects:

- User messages sent from the webapp (optimistic local timestamp vs. pi's recorded timestamp).
- Assistant messages (local `assistant_done` timestamp vs. session entry timestamp).
- Page reload where localStorage already contains the messages and `sync_response` re-sends them.

## Solution

Strengthen deduplication in `useLocalStorage` by adding a short-window content-based check in addition to the existing ID-based check.

### Algorithm

Define a duplicate window `DEDUP_WINDOW_MS = 5000`.

Two messages `a` and `b` are considered duplicates if:

- `a.role === b.role`
- `a.text.trim() === b.text.trim()`
- `Math.abs(a.timestamp - b.timestamp) <= DEDUP_WINDOW_MS`

When merging incoming messages, skip any that are duplicates of an already-stored message (prefer the local/earlier copy).

### Files to change

- `packages/webapp/src/hooks/useLocalStorage.ts`
- `packages/webapp/src/hooks/useLocalStorage.test.ts`

### Implementation notes

- Keep the existing `id`-based dedup as the fast path.
- Add the content+time fallback in `mergeMessages`. Optionally also guard `addMessage` so a directly received `user_message` or `assistant_done` that matches a stored message is not duplicated.
- Do not overwrite the stored copy with the incoming copy; keep the one already in state/localStorage to preserve ordering and the optimistic timestamp the user saw.

### Tests to add

1. **Sync duplicate within the window:** seed state with `role: "user", text: "hello", timestamp: 1000`. Merge an incoming message with same role/text and timestamp `3500`. Result: still one message.
2. **Sync duplicate outside the window:** same text/role but timestamp `20000`. Result: two messages.
3. **Assistant duplicate from sync:** store an assistant message, merge a sync entry with same text and timestamp within 5s. Result: one message.
4. **Different text is kept:** store `hi`, merge `hello` at the same timestamp. Result: two messages.
5. **Same text, different role is kept:** store user `go`, merge assistant `go`. Result: two messages.

## Risks & trade-offs

- Two genuinely identical messages sent within 5 seconds will collapse into one. This is acceptable for a chat interface and keeps the implementation simple.
- The window is intentionally small; it does not affect messages separated by normal conversation gaps.

## Out of scope

- Adding unique message IDs to the wire protocol or pi session entries.
- Deduplicating across different sessions.
- Server-authoritative ordering beyond the existing timestamp sort.