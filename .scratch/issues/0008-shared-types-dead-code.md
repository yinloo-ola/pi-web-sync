---
id: 0008
title: "Shared types package + dead code cleanup"
type: task
parent: 0001
blocked_by: []
assigned: yinlootan
status: closed
---

## Question

Stop the `RelayMessage` type from drifting across packages and remove the dead
code flagged in the v0.1 verification report.

## Resolution

**Shared types:** The extension's `types.ts` is now the single source of truth
(doc comment updated). The webapp's `types.ts` was rewritten to contain only
`ChatMessage` (webapp-specific). Three webapp files (`useRelay.ts`,
`useRelay.test.ts`, `App.tsx`) now import `RelayMessage` and `MessageType` from
`../../../extension/types` (or `../../extension/types` from `src/`).

**Dead code removed:**
- `clearMessages` deleted from `useLocalStorage.ts` (was exported, destructured
  in `App.tsx`, never called).
- `clearMessages` removed from `App.tsx` destructuring.

**`sessionId` in `ChatProps`:** Already absent from the codebase — no action needed.

**Done when** checklist:
- ✅ Single source of truth for `RelayMessage` / `MessageType` (extension/types.ts)
- ✅ Webapp imports relay types from extension (no duplicates)
- ✅ `clearMessages` removed
- ✅ Unused `sessionId` prop already gone
- ✅ tsc clean, 17/17 extension+relay tests pass

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