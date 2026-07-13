---
id: 0020
title: "Add sub-command autocomplete to /web-sync"
type: task
parent: 0019
blocked_by: []
assigned: null
status: closed
triage: ready-for-agent
---

# Add sub-command autocomplete to /web-sync

## Question

How do we make `/web-sync <Tab>` show available sub-commands in pi?

## Resolution

Added `getArgumentCompletions` to the `/web-sync` command registration in `packages/extension/index.ts`. The function returns `connect`, `disconnect`, `status`, `qr` filtered by prefix. Also added `import type { AutocompleteItem } from "@earendil-works/pi-tui"` for the return type.

Verified: `/web-sync <Tab>` shows all four sub-commands, `/web-sync c<Tab>` filters to `connect`.