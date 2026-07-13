---
id: 0047
title: "Spec: Webapp message quality (table overflow, duplicate sync, prompt support)"
type: task
parent: 0043
blocked_by: []
assigned: null
status: open
triage: ready-for-agent
---

# Spec: Webapp message quality (table overflow, duplicate sync, prompt support)

## Problem Statement

The pi-web-sync webapp has three quality gaps that break the reading and composing experience:

1. **Wide markdown tables overflow the viewport.** `ReactMarkdown` with `remarkGfm` renders tables and code blocks that can be wider than the message bubble. The bubble has no overflow handling, so the entire chat becomes horizontally scrollable on mobile and desktop.
2. **Messages sometimes appear twice after reconnect or refresh.** The webapp stores messages keyed by `${sessionId}-${timestamp}`. After a reconnect, the `sync_response` may return the same message with a slightly different timestamp, so existing deduplication by ID fails and the user sees duplicate entries.
3. **Prompt templates cannot be sent from the browser.** In pi, typing `/name [args]` expands a Markdown prompt template from `~/.pi/agent/prompts/*.md` or `<project>/.pi/prompts/*.md`. The webapp has no way to discover or invoke these templates, forcing the user back to the terminal.

## Solution

A three-part improvement:

1. **Overflow-safe rendering** — add CSS rules so tables and code blocks scroll horizontally inside the bubble, long words break, and images never exceed the bubble width.
2. **Content-based deduplication** — extend the message-store merge logic with a short-window duplicate check: same `role`, same normalized `text`, and timestamps within a small tolerance are treated as the same message.
3. **Prompt template support** — the extension discovers global and project prompt templates, sends the list to the webapp, the slash menu adds a `/prompt` command with a template submenu, and the extension expands template arguments before forwarding the message to pi.

## User Stories

### Table overflow

1. As a webapp user, I want wide markdown tables to scroll horizontally inside the message bubble, so that the page never becomes horizontally scrollable.
2. As a webapp user, I want long code blocks to scroll horizontally, so that large snippets remain readable without breaking the layout.
3. As a webapp user, I want images in assistant messages to scale down, so that they fit inside the bubble on mobile.
4. As a mobile user, I want long URLs or unbreakable words to wrap, so that they do not force the chat width to grow.
5. As a webapp user, I want the overflow behavior to apply to both user and assistant bubbles, so that the experience is consistent.
6. As a webapp user, I want table borders and cell padding to remain readable, so that tables are still useful after the overflow fix.

### Duplicate messages

7. As a webapp user, I want refreshing the page to not duplicate existing messages, so that history stays clean.
8. As a webapp user, I want reconnecting after a network drop to not duplicate messages, so that I don't have to scroll past repeated entries.
9. As a webapp user, I want messages I sent from the browser to not appear twice after the next sync, so that my conversation reads naturally.
10. As a webapp user, I want genuine repeated messages sent far apart to still be shown, so that intentional repetition is preserved.
11. As a webapp user, I want deduplication to keep the message I already saw, so that timestamps and ordering remain stable.
12. As a developer, I want duplicate detection to be deterministic and testable, so that regressions are caught in unit tests.

### Prompt templates

13. As a webapp user, I want to see my available prompt templates in the slash menu, so that I can invoke them without remembering names.
14. As a webapp user, I want prompt templates to show their description, so that I can choose the right one.
15. As a webapp user, I want prompt templates with required arguments to show an argument hint, so that I know what to type.
16. As a webapp user, I want selecting a prompt template to fill the input with `/name `, so that I can add arguments before sending.
17. As a webapp user, I want the prompt template to expand into the full prompt text before pi sees it, so that the behavior matches typing `/name` in the terminal.
18. As a pi user, I want prompt expansion to support positional arguments (`$1`, `$2`), all-arguments (`$@`, `$ARGUMENTS`), defaults (`${1:-default}`), and slices (`${@:N}`, `${@:N:L}`), so that my existing templates work unchanged.
19. As a webapp user, I want only global and project prompt templates to appear, so that the list is predictable and scoped to my environment.
20. As a pi user, I want project prompt templates to be skipped when the project is not trusted, so that pi's trust model is respected.

## Implementation Decisions

### Overflow-safe rendering

- The fix is purely CSS on the existing `.message-bubble` class and the markdown elements it contains. No React component structure change is needed.
- The existing inline styles on `MessageBubble` will be augmented with `overflowWrap: "break-word"` and `maxWidth: "100%"` as a backstop.
- Tables will be wrapped in an `overflow-x: auto` rule by setting `display: block; max-width: 100%; overflow-x: auto` on `.message-bubble table`.
- Code blocks (`pre`) will also get horizontal scrolling; inline code remains inline.
- Images will get `max-width: 100%` so they scale down.

### Duplicate-message deduplication

- The primary dedup key remains the message `id`, but because timestamps can drift, a secondary content-based check is added.
- Duplicate rule: same `role`, same normalized `text`, and timestamps within `DEDUP_WINDOW_MS = 5000`.
- Incoming sync messages that match an existing message by content+window are skipped; the existing message is kept.
- This logic lives with the message persistence seam (`useLocalStorage`) because that is where merge/store operations already happen.

### Prompt template discovery and expansion

- A new extension-side seam will load prompt templates from disk and expand them. This keeps filesystem I/O and argument-substitution logic separate from the WebSocket and UI code.
- Discovery sources:
  - `getAgentDir()/prompts` (global)
  - `<cwd>/.pi/prompts` (project, only when `ctx.isProjectTrusted()`)
- Each `*.md` file yields one template: `name` (filename without extension), `description` (frontmatter `description` or first non-empty body line), optional `argumentHint` (frontmatter), and `content` (body).
- Frontmatter parsing reuses the `parseFrontmatter` utility already exported by `@earendil-works/pi-coding-agent`.
- Template expansion re-implements pi's documented substitution rules: `$1`, `$2`, `$@`, `$ARGUMENTS`, `${N:-default}`, `${@:N}`, `${@:N:L}`. Argument parsing supports bash-style quoted strings.
- On connect and on every `sync_request`, the extension loads templates and sends a `prompts_list` message to the webapp.
- When a `user_message` starts with `/`, the extension tries to expand it against the loaded templates; if it expands, the expanded text is sent to pi. If not, the original text is sent.

### Wire protocol additions

The protocol package gains one new message type and payload:

```ts
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
  | "pi_command"
  | "models_list"
  | "skills_list"
  | "session_ended"
  | "prompts_list";   // NEW

export interface PromptInfo {
  name: string;
  description: string;
  argumentHint?: string;
}

export interface PromptsListPayload {
  prompts: PromptInfo[];
}
```

This is symmetric to the existing `models_list` and `skills_list` discovery messages.

### Webapp prompt UI

- `useRelay` will handle `prompts_list`, exposing `availablePrompts: PromptInfo[]` to the rest of the app.
- `SlashMenu` will gain a `prompt` command with a submenu. Selecting a prompt calls the existing `onFillInput` callback with `/<name> ` (trailing space so the user can type arguments).
- The user can also type `/name args` directly; the extension will expand it as long as the template is known.

## Testing Decisions

### What makes a good test

Test externally observable behavior, not the internal implementation. For example:
- For overflow: render a message bubble containing a wide table and assert the table wrapper has horizontal scrolling.
- For dedup: seed stored messages, merge a sync payload, and assert the final message count/order.
- For prompts: point the loader at a temporary directory, assert the discovered list, and assert that input strings expand to the expected output.

### Modules to test

1. **Message bubble rendering** — new test for tables/code/images.
2. **`useLocalStorage` hook** — extend existing tests with duplicate-window scenarios.
3. **New prompt loader/expander module** — pure logic, highest seam for prompt expansion.
4. **`useRelay` hook** — extend existing tests to assert `prompts_list` updates `availablePrompts`.
5. **`SlashMenu` component** — new tests for prompt submenu and input fill behavior.

### Prior art

- `useLocalStorage.test.ts` already uses mocked `localStorage` and `renderHook`; dedup tests follow the same pattern.
- `SlashMenu.test.tsx` already covers model/skill submenus; prompt tests follow the same interaction pattern (`fireEvent.click`, `fireEvent.keyDown`).
- `useRelay.test.ts` already tests discovery messages (`models_list`, `skills_list`); `prompts_list` follows the same shape.

## Out of Scope

- Major visual redesign of message bubbles, headers, or input areas.
- Server-side persistent message IDs or a fully authoritative ordering scheme.
- Editing, creating, or deleting prompt templates from the webapp.
- Discovering prompt templates from package manifests, theme directories, or the `promptPaths` user setting (only the default global + project `.pi/prompts` directories).
- Showing prompt templates as top-level `/` suggestions outside the `/prompt` submenu.
- Storing prompt templates in `localStorage`; they are re-fetched on each connect/sync.

## Further Notes

- **Prompt/command collision:** built-in slash commands (`/model`, `/skill`, `/compact`) are not valid prompt template names unless the user has explicitly created a template with that name. If a collision occurs, the prompt expansion path runs first on the raw `user_message`; because `/model` does not match a prompt name, the literal text reaches pi unchanged. A future improvement could namespace prompts with `/prompt <name>` if collisions become common.
- **Trust:** the extension must respect pi's project-trust model and skip project-local prompts when `ctx.isProjectTrusted()` is false.
- **Reconnection behavior:** prompt templates are reloaded on every sync request, so a user who edits a prompt file mid-session will see the updated list after the next reconnect.