---
id: 0025
title: "Stale URL detection and Session ended banner"
type: task
parent: 0019
blocked_by: [0022]
assigned: null
status: closed
triage: ready-for-agent
---

# 0025 — Stale URL detection and Session ended banner

**What to build:** When pi starts a new session, the old webapp connection shows a clear "Session ended" message with instructions to get a new link. Users are never confused by a blank or broken page on a stale URL.

**Blocked by:** 0022 (relay protocol — needs `session_ended` message type)

**Status:** done

## Resolution

Extension emits `session_ended` in `session_shutdown` handler (skipped for `reload` to avoid false positives during dev). Reason mapping: `quit` → `shutdown`, everything else → `new_session`. Webapp relay hook handles `session_ended`, sets `sessionEnded` state. Stale URL detection: 5s timer after connect, canceled on `peer_connected` or `sync_response`. Chat shows "Session ended" banner with instructions. Input disabled when `sessionEnded`. LocalStorage cleared on session end. 4 new tests added (9 total relay tests). All 17 webapp + 7 relay tests pass.

- [x] Extension: emit `session_ended` message when a new session starts (in `session_before_switch` or `session_shutdown` handler)
- [x] Extension: emit `session_ended` message when pi shuts down
- [x] Webapp relay hook: handle `session_ended` message type, set a new state (e.g., `sessionEnded: true`)
- [x] Webapp App component: when `sessionEnded` is true, show a banner: "Session ended — run `/web-sync qr` in pi to get a new link"
- [x] Webapp: detect stale URLs visited after pi has moved on (relay connects but no `peer_connected` for pi within 5 seconds and no `sync_response` arrives) — show the same "Session ended" banner
- [x] Verify the banner is visible and the instructions are clear
- [x] Verify the old session's localStorage is cleared when `session_ended` is received
- [x] Add tests for `session_ended` handling and stale URL detection