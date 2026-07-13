---
id: 0043
title: "Webapp message quality: table overflow, duplicate sync, and prompt support"
type: map
parent: null
blocked_by: []
assigned: null
status: open
triage: ready-for-agent
---

# Webapp message quality: table overflow, duplicate sync, and prompt support

## Destination

The pi-web-sync webapp renders wide markdown tables without overflowing the viewport, re-synced history no longer shows duplicate messages, and users can send prompt templates (`~/.pi/agent/prompts/*.md` and `<cwd>/.pi/prompts/*.md`) from the browser via a slash menu.

## Notes

- **Domain:** pi-web-sync — a pi extension + WebSocket relay (CF Worker / Durable Object) + React web app that syncs a live pi session to the browser in real time.
- The webapp already has responsive sizing, localStorage TTL, slash commands for `/model`, `/skill`, and `/compact`, and typed `pi_command` messages.
- These three issues were reported together and are small, independent UX fixes.

## Decisions so far

- [Spec: Webapp message quality](0047-spec-webapp-polish-prompts.md) — full PRD covering overflow-safe rendering, content-based deduplication, and prompt-template discovery/expansion. ✓
- [Fix markdown table overflow in webapp message bubbles](0044-fix-table-overflow-webapp.md) — `.message-bubble` now wraps/breaks text, tables and code blocks scroll horizontally, images scale, and `MessageBubble` is covered by tests. Closed.
- [Deduplicate messages after history sync](0045-dedupe-synced-messages.md) — `useLocalStorage` now deduplicates by role + text + 5s timestamp window as well as by id. `useLocalStorage` tests expanded. Closed.
- [Send prompt templates from the webapp](0046-send-prompt-templates-webapp.md) — extension discovers and expands prompt templates, webapp lists them under `/prompt`, and the wire protocol gained `prompts_list`. Closed.

## Implementation tickets

- [0044] ~~Fix markdown table overflow in webapp message bubbles~~ ✓
- [0045] ~~Deduplicate messages after history sync~~ ✓
- [0046] ~~Send prompt templates from the webapp~~ ✓

## Not yet specified

<!-- fog: in-scope decisions not yet sharp enough to ticket -->

All decisions are now captured in the spec. The implementation tickets above are ready for development.

## Out of scope

- **Visual redesign of message bubbles.** Only overflow/scroll behavior changes.
- **Persistent message IDs from pi / server-side ordering.** Duplicate prevention is content+fingerprint based within a short window.
- **Editing or creating prompt templates from the webapp.** Read and send only.
- **Prompt templates from package/theme sources.** Global + project `.pi/prompts` directories only.