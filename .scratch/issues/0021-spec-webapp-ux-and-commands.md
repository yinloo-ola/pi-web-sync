---
id: 0021
title: "Spec: Webapp UX polish and pi commands from browser"
type: task
parent: 0019
blocked_by: [0020]
assigned: null
status: closed
triage: ready-for-agent
---

# Spec: Webapp UX polish and pi commands from browser

## Resolution

Spec complete. Broken into 6 implementation tickets (0022-0027) under map 0019.

## Problem Statement

The pi-web-sync webapp has several UX gaps that make it unusable on mobile and limiting on desktop:

1. **No sub-command autocomplete** — typing `/web-sync <Tab>` in pi doesn't show available sub-commands (connect, disconnect, status, qr). Users must memorize the sub-command names.

2. **localStorage grows unbounded** — chat messages keyed by session ID are never cleared. Old sessions accumulate forever, and stale session URLs show no useful information when the session has ended.

3. **Not responsive** — the Chat component uses `maxWidth: 720` with no media queries. On mobile, the layout is cramped, text is hard to read, and the input area is not thumb-friendly.

4. **No pi commands from webapp** — users cannot switch models, run skills, or compact the session from the browser. They must switch back to the pi terminal for these actions.

## Solution

A multi-part improvement that addresses all four gaps:

1. **Sub-command autocomplete** — add `getArgumentCompletions` to the `/web-sync` command registration so `/web-sync <Tab>` shows available sub-commands. (Already implemented.)

2. **localStorage lifecycle** — auto-expire entries after 1 week, clear old session data when a new session starts, add a manual "Clear chat" button, and show a "Session ended" message when visiting a stale URL.

3. **Responsive layout** — replace fixed `maxWidth` with fluid layout, add media queries for mobile, adjust padding/typography for small screens, and make the input area thumb-friendly.

4. **Pi commands from webapp** — add a slash menu triggered by `/` in the input that shows available commands (`/model`, `/skill:name`, `/compact`). Use relay-based model discovery so the webapp shows actual available models.

## User Stories

### Sub-command autocomplete

1. As a pi user, I want `/web-sync <Tab>` to show available sub-commands, so that I don't have to memorize them
2. As a pi user, I want `/web-sync c<Tab>` to filter to `connect`, so that I can type less
3. As a pi user, I want `/web-sync <Tab>` to show `connect`, `disconnect`, `status`, `qr`, so that I know all available actions

### LocalStorage lifecycle

4. As a webapp user, I want old chat history to auto-expire after 1 week, so that my browser storage doesn't grow unbounded
5. As a webapp user, I want a "Clear chat" button, so that I can manually wipe my history
6. As a webapp user, I want old session data to be cleared when pi starts a new session, so that orphaned data doesn't accumulate
7. As a webapp user visiting a stale URL, I want to see "Session ended" with instructions to get a new link, so that I'm not confused by a blank or broken page
8. As a webapp user, I want cached history to be available when I reopen a still-active session, so that I don't lose context
9. As a webapp user, I want localStorage to survive page refreshes within the same session, so that my chat history persists
10. As a webapp user, I want the TTL check to happen on load, so that expired entries are cleaned up immediately

### Responsive layout

11. As a mobile user, I want the chat to fill the screen width, so that messages are readable
12. As a mobile user, I want the input area to be thumb-friendly, so that I can type comfortably
13. As a mobile user, I want the header status indicators to wrap gracefully, so that they don't overflow
14. As a mobile user, I want message bubbles to have appropriate padding for small screens, so that text isn't cramped
15. As a desktop user, I want the chat to have a reasonable max-width, so that long lines are still readable
16. As a user on any device, I want the "No messages yet" empty state to be centered and readable
17. As a user on any device, I want the reconnect banner to be visible and actionable

### Pi commands from webapp

18. As a webapp user, I want to type `/` in the input to see a list of available pi commands, so that I can control pi from the browser
19. As a webapp user, I want `/model` to show a list of available models from pi, so that I can switch models without leaving the webapp
20. As a webapp user, I want `/skill:name` to execute a skill in pi, so that I can run skills from the browser
21. As a webapp user, I want `/compact` to trigger compaction in pi, so that I can manage context from the browser
22. As a webapp user, I want the slash menu to filter as I type, so that I can find commands quickly
23. As a webapp user, I want the slash menu to close when I press Escape or click outside, so that it doesn't obstruct the chat
24. As a webapp user, I want the slash menu to show command descriptions, so that I understand what each command does
25. As a webapp user, I want model switching to show the current model as selected, so that I know what's active
26. As a webapp user, I want skill execution to show a confirmation or feedback, so that I know the skill was sent to pi
27. As a webapp user, I want `/compact` to show confirmation that pi received the command, so that I know it worked

### Relay protocol

28. As the system, I want a `pi_command` message type for webapp-to-pi command routing, so that commands are distinguishable from regular user messages
29. As the system, I want a `models_list` message type for pi-to-webapp model discovery, so that the webapp knows what models are available
30. As the system, I want a `session_ended` message type for pi-to-webapp session lifecycle, so that the webapp can detect stale sessions
31. As the extension, I want to emit `models_list` on connect, so that the webapp has current model information
32. As the extension, I want to handle `pi_command` messages and route them to `pi.sendUserMessage()`, so that webapp commands are executed in pi
33. As the extension, I want to emit `session_ended` when a new session starts, so that the old webapp connection knows the session is over

## Implementation Decisions

### Modules to build/modify

- **`packages/extension/types.ts`** — add new message types (`pi_command`, `models_list`, `session_ended`) and their payload interfaces. This is the single source of truth for relay wire types (decision from 0008).
- **`packages/extension/index.ts`** — add `pi_command` handler (route to `pi.sendUserMessage()`), add `models_list` emission on connect (using `ctx.modelRegistry`), add `session_ended` emission on new session.
- **`packages/webapp/src/hooks/useLocalStorage.ts`** — add TTL logic (1-week expiry), add `clearMessages()` function, add TTL check on load.
- **`packages/webapp/src/hooks/useRelay.ts`** — handle `session_ended` message type, set pi status to disconnected.
- **`packages/webapp/src/App.tsx`** — detect stale session (relay connected but no pi peer + session_ended received), show "Session ended" banner with `/web-sync qr` instructions.
- **`packages/webapp/src/components/Chat.tsx`** — responsive layout (fluid width, media queries, mobile-friendly input), slash menu component, "Clear chat" button, "Session ended" banner.
- **`packages/webapp/src/components/MessageBubble.tsx`** — responsive padding and max-width for message bubbles.
- **New: `packages/webapp/src/components/SlashMenu.tsx`** — slash menu component for command discovery and dispatch.

### Relay protocol changes

New message types added to `MessageType` union:

```typescript
// From prototype — encodes the exact wire shape
export type MessageType =
  | "user_message"
  | "assistant_delta"
  | "assistant_done"
  | "sync_request"
  | "sync_response"
  | "peer_connected"
  | "peer_disconnected"
  | "ping"
  | "pong"
  | "pi_command"      // NEW: webapp → pi command routing
  | "models_list"     // NEW: pi → webapp model discovery
  | "session_ended";  // NEW: pi → webapp session lifecycle
```

Payload interfaces:

- `PiCommandPayload`: `{ command: string }` — the full command string (e.g., "model anthropic/claude-sonnet-4-5", "skill:research", "compact")
- `ModelsListPayload`: `{ models: Array<{ id: string; provider: string; name: string }> }` — available models from pi's registry
- `SessionEndedPayload`: `{ reason: "new_session" | "shutdown" }` — why the session ended

### localStorage lifecycle

- **TTL**: 1 week (604800000 ms). On load, check `timestamp` field of stored messages. If oldest message is older than 1 week, clear the entire session's localStorage.
- **Clear on new session**: When `session_ended` message is received, call `clearMessages()` and show "Session ended" banner.
- **Manual clear**: "Clear chat" button in the Chat header calls `clearMessages()`.
- **Stale URL**: If relay connects but no `peer_connected` for pi within 5 seconds, and no `sync_response` arrives, show "Session ended" banner. This covers the case where the URL is visited after pi has moved to a new session.

### Responsive layout

- Replace `maxWidth: 720` with `maxWidth: 100%` and add `@media (min-width: 768px) { maxWidth: 720px }`.
- Adjust padding: `16px 20px` on desktop, `12px 16px` on mobile.
- Input area: full-width input with smaller padding on mobile, larger touch targets.
- Header: flex-wrap for status indicators on small screens.
- Message bubbles: `maxWidth: 85%` on mobile (vs 80% on desktop).

### Slash menu

- Triggered by `/` as the first character in the input.
- Shows available commands: `model`, `skill`, `compact`.
- For `model`: shows sub-menu with available models from `models_list` payload.
- For `skill`: shows text input for skill name (or sub-menu if skills are discoverable).
- For `compact`: sends immediately with confirmation.
- Filtering: as user types after `/`, filter commands by prefix.
- Dismiss: Escape key or clicking outside the menu.
- Selection: Enter or click sends the command as a `pi_command` message.

### Testing seams

1. **Relay protocol** (`packages/extension/types.ts`) — highest seam. Test message type definitions and serialization. Both extension and webapp import from here.
2. **useLocalStorage hook** — test TTL expiry, clear, merge deduplication. Pure logic with mocked `localStorage` and `Date`.
3. **Chat component** — test responsive layout (viewport-dependent), slash menu rendering, "Session ended" banner. Integration-level tests.
4. **Extension command handler** — test `pi_command` routing and `models_list` emission. Requires mocking `pi` API.

## Testing Decisions

### What makes a good test

- Test external behavior, not implementation details. For example, test that "localStorage is cleared after 1 week" by mocking `Date` and checking the stored value, not by testing the internal TTL calculation.
- Test message types by serializing/deserializing and checking the shape matches the interface.
- Test responsive layout by checking that elements have correct styles at different viewport widths (using CSS media query simulation or style assertions).
- Test slash menu by simulating user input (`/model`) and checking that the menu appears with correct items.

### Modules to be tested

- `packages/webapp/src/hooks/useLocalStorage.test.ts` — extend existing tests for TTL, clear, stale session detection
- `packages/webapp/src/hooks/useRelay.test.ts` — extend existing tests for `session_ended` and `models_list` handling
- `packages/webapp/src/components/Chat.test.tsx` — new tests for responsive layout, slash menu, "Session ended" banner
- `packages/extension/index.test.ts` — new tests for `pi_command` handling and `models_list` emission (if test infrastructure exists)

### Prior art

- `useLocalStorage.test.ts` already tests merge, dedup, and persistence. TTL tests follow the same pattern with mocked `Date`.
- `useRelay.test.ts` already tests connection states and message handling. New message types follow the same pattern.
- No existing component tests for Chat — these would be new, following React Testing Library conventions.

## Out of Scope

- **Dark mode.** Polished but not in this effort — responsive layout first.
- **Typing indicator.** Feature polish, not UX foundation.
- **Visual polish of the "Clear chat" button.** Just needs to exist; styling later.
- **Command palette beyond /model, /skill, /compact.** Keep scope tight.
- **Multi-browser-tab sync.** One tab per session (decision from 0004).
- **Skill discovery from pi.** The slash menu shows `/skill:name` but doesn't enumerate available skills — user must know the skill name.
- **Model parameter customization.** Model switching only; no temperature/top-p controls from webapp.

## Further Notes

- The `getArgumentCompletions` for `/web-sync` sub-commands is already implemented (ticket 0020). This spec covers the remaining three topics.
- The relay protocol changes are backward-compatible — old clients ignore unknown message types.
- The 1-week TTL is a starting point; could be made configurable later via `~/.pi-web-sync.json`.