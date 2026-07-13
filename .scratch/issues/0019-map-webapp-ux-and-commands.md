---
id: 0019
title: "Webapp UX polish and pi commands from browser"
type: map
parent: null
blocked_by: []
assigned: null
status: open
---

# Webapp UX polish and pi commands from browser

## Destination

The pi-web-sync webapp is responsive and usable on mobile, localStorage doesn't grow unbounded, stale session URLs show a clear "session ended" message, and users can send pi commands (model switching, skill execution, compact) from the browser via a slash menu.

## Notes

- **Domain:** pi-web-sync — a pi extension + WebSocket relay (CF Worker / Durable Object) + React web app that syncs a live pi session to the browser in real time.
- **Three packages:** `packages/extension` (pi plugin, Node), `packages/relay` (CF Worker + DO), `packages/webapp` (React + Vite).
- **Skills:** `/grilling`, `/domain-modeling` for decisions; `/tdd` and `/implement` for execution.
- **Standing preferences:**
  - Tests live in each package (`npx vitest`).
  - `RelayMessage` types must not drift across packages (single source of truth in `packages/extension/types.ts`).
  - Prefer inline styles with responsive overrides over CSS frameworks (existing pattern).
- **Tracker:** local markdown under `.scratch/issues/` — see `docs/agents/issue-tracker.md`.
- **Execution in the map:** this effort's tickets are TASK type — the destination is a change made in place.

## Decisions so far

- [Sub-command autocomplete for /web-sync](0020-subcommand-autocomplete.md) — `getArgumentCompletions` added to `/web-sync` command registration. Shows `connect`, `disconnect`, `status`, `qr` on Tab. Done.
- [Spec: Webapp UX polish and pi commands](0021-spec-webapp-ux-and-commands.md) — full spec covering localStorage lifecycle, responsive layout, slash menu for pi commands, and relay protocol extensions. ✓

## Implementation tickets

- [0022] ~~Relay protocol extensions~~ — new message types (pi_command, models_list, session_ended) ✓
- [0023] ~~localStorage TTL and manual clear~~ — auto-expire 1 week, Clear chat button ✓
- [0024] ~~Responsive layout~~ — mobile-friendly sizing, fluid width, thumb-friendly input ✓
- [0025] ~~Stale URL detection~~ — Session ended banner (blocked by 0022) ✓
- [0026] ~~Slash menu for pi commands~~ — / triggers command palette (blocked by 0022) ✓
- [0027] Model discovery via relay — extension sends models, webapp shows them (blocked by 0022, 0026)

## Not yet specified

<!-- fog: in-scope decisions not yet sharp enough to ticket -->

**Spec published.** All decisions are now captured in [0021-spec-webapp-ux-and-commands.md](0021-spec-webapp-ux-and-commands.md). No fog remains — ready for implementation tickets.

## Out of scope

<!-- work consciously ruled out of this effort -->

- **Dark mode.** Polished but not in this effort — responsive layout first.
- **Typing indicator.** Feature polish, not UX foundation.
- **Manual "Clear chat" button UI design.** Just needs to exist; visual polish later.
- **Command palette beyond /model, /skill, /compact.** Keep scope tight.
- **Multi-browser-tab sync.** One tab per session (decision from 0004).