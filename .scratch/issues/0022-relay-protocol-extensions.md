---
id: 0022
title: "Relay protocol extensions: pi_command, models_list, session_ended"
type: task
parent: 0019
blocked_by: []
assigned: null
status: closed
triage: ready-for-agent
---

# 0022 — Relay protocol extensions: pi_command, models_list, session_ended

**What to build:** New message types in the shared relay wire format so the webapp can send commands to pi, receive available models, and detect when a session has ended. No behavior change yet — just the type definitions and payload interfaces.

**Blocked by:** None — can start immediately.

**Status:** done

## Resolution

Added three new message types (`pi_command`, `models_list`, `session_ended`) and their payload interfaces to `packages/extension/types.ts`. Types file compiles cleanly. All existing tests pass (webapp: 10/10, relay: 7/7). The `@earendil-works/pi-tui` TypeScript error is pre-existing from ticket 0020.

- [x] Add `pi_command`, `models_list`, `session_ended` to the `MessageType` union in the shared types package
- [x] Add `PiCommandPayload` interface: `{ command: string }` — the full command string (e.g., "model anthropic/claude-sonnet-4-5", "skill:research", "compact")
- [x] Add `ModelsListPayload` interface: `{ models: Array<{ id: string; provider: string; name: string }> }` — available models from pi's registry
- [x] Add `SessionEndedPayload` interface: `{ reason: "new_session" | "shutdown" }` — why the session ended
- [x] Verify both extension and webapp can import and serialize/deserialize the new types without errors
- [x] Run existing tests to confirm no regressions