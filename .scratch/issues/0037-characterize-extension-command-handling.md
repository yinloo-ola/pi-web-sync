---
id: 0037
title: "Characterize the extension's command handling"
type: task
parent: 0035
blocked_by: []
assigned: null
status: done
triage: ready-for-agent
---

# 0037 — Characterize the extension's command handling

## What to build

Write characterization tests for the extension's current command handler,
asserting the pi-API action each command triggers **today** — the behavior that
ticket 0040 (typed commands) must preserve. Cover every branch: a model switch
(model found / not found / no API key / malformed `provider/id`), compact, a
skill (with and without args), and unknown commands. This is the audit's
characterization gate for candidate D; it lands before any wire-format change.

## Acceptance criteria

- [x] Each command branch (model variants, compact, skill variants, unknown) has a test asserting the pi-API effect it triggers today (`setModel` / `compact` / `sendMessage` / `sendUserMessage`, and the notify messages).
- [x] Tests pass against the current string-based handler, locking its behavior.

## Blocked by

None — can start immediately. (Frontier ticket; gates 0040.)