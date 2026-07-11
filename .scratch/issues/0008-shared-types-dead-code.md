---
id: 0008
title: "Shared types package + dead code cleanup"
type: task
parent: 0001
blocked_by: []
assigned: null
status: open
---

## Question

Stop the `RelayMessage` type from drifting across packages and remove the dead
code flagged in the v0.1 verification report.

## Context

- `packages/extension/types.ts` and `packages/webapp/src/types.ts` define
  identical `RelayMessage` / payload types. New fields (e.g. the `ping`/`pong`
  from 0006) will diverge silently. Finding O-001 in the verification report.
- Dead code (report O-002, O-003):
  - `useLocalStorage.ts` exports `clearMessages`, never called.
  - `ChatProps` declares `sessionId`, but `Chat` doesn't destructure or use it,
    and `App.tsx` passes it.
- Note: if 0002/0003/0006 already touch these type files, coordinate so the
  shared package lands once and everyone imports from it.

## Done when

- A shared types location is chosen (e.g. `packages/shared/types.ts`, or a
  `types` export from the extension package the web app imports in dev) and both
  packages import `RelayMessage` and payload types from it — no duplicates.
- `clearMessages` removed (or wired up if a clear-UI is wanted — decide and
  record).
- Unused `sessionId` prop removed from `ChatProps` and its call site, OR used.
- Comment noting the single source of truth added where the shared types live.
- Builds and tests pass across all three packages.