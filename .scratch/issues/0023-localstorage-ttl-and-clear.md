---
id: 0023
title: "localStorage TTL and manual clear"
type: task
parent: 0019
blocked_by: []
assigned: null
status: closed
triage: ready-for-agent
---

# 0023 — localStorage TTL and manual clear

**What to build:** Chat messages auto-expire after 1 week so browser storage doesn't grow unbounded. A "Clear chat" button lets users manually wipe their history. History still survives page refreshes within an active session.

**Blocked by:** None — can start immediately.

**Status:** done

## Resolution

Added TTL logic (1-week expiry) to `useLocalStorage` hook. Added `clearMessages()` function. Added "Clear chat" button in Chat header (visible when messages exist). 4 new tests added: TTL expiry, recent messages kept, empty localStorage, clearMessages. All 14 webapp tests + 7 relay tests pass.

- [x] Add TTL logic to the localStorage hook: on load, check the oldest message timestamp; if older than 1 week (604800000 ms), clear the entire session's localStorage key
- [x] Add `clearMessages()` function to the hook that sets the stored messages to an empty array
- [x] Add a "Clear chat" button in the Chat header that calls `clearMessages()`
- [x] Verify history survives page refresh within an active session
- [x] Verify old entries (>1 week) are cleared on load
- [x] Verify the "Clear chat" button wipes the current session's localStorage
- [x] Add tests for TTL expiry, manual clear, and persistence across refresh