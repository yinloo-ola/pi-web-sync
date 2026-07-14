---
id: 0010
title: "Slash menu entry to discover and invoke extension-registered commands"
type: task
parent: null
blocked_by: []
assigned: null
labels: [ready-for-agent]
status: open
---

## Problem Statement

The web app's slash menu exposes four hard-coded commands: `model`, `skill`,
`prompt`, `compact`. Pi extensions register many more commands via
`pi.registerCommand()` (e.g., `/web-sync`, `/review`, `/deploy`), but the web
app user has no way to discover them. They must already know the command name
to type it manually.

Typing an unknown `/command_name` already works — the web app's
`handleSendCommand` falls through to sending it as a `user_message`, and pi
routes it via its built-in slash routing — but there's no discovery UI. The
user is flying blind.

## Solution

Add a `/command` entry to the slash menu that lists all extension-registered
commands from pi. The user selects one, which fills the input with `/<name> `,
then adds arguments and sends — same UX as `/skill:` and `/prompt`.

No changes to how commands are sent or routed. The existing fallthrough in
`handleSendCommand` (unparseable commands are sent as `user_message`) means
pi already handles extension commands correctly. The gap is only visibility.

## User Stories

1. As a web app user, I want to see all extension-registered commands in the
   slash menu, so that I can discover what commands are available without
   memorizing them.
2. As a web app user, I want to type `/command ` and see a filtered submenu of
   available commands, so that I can find the one I need by name or
   description.
3. As a web app user, I want to click a command in the submenu and have the
   input filled with `/<command_name> `, so that I can immediately type
   arguments.
4. As a web app user, I want to send `/<command_name> <args>` and have pi
   execute it, so that extension commands work the same way whether invoked
   from the menu or typed manually.
5. As a pi extension author, I want my registered commands to appear in the
   web app automatically, so that users of the web sync can discover and use my
   commands without additional configuration.
6. As a web app maintainer, I want the commands list to follow the existing
   pattern of `models_list` / `skills_list`, so that adding new list types
   doesn't introduce bespoke wiring.

## Implementation Decisions

### Wire protocol: `commands_list` relay message

A new `commands_list` message type follows the same shape as `skills_list`:

```
MessageType adds: "commands_list"

CommandsListPayload {
  commands: Array<{ name: string; description?: string; source: string }>
}
```

The extension pushes this on sync (same as `models_list` / `skills_list`).
No new `PiCommand` kind is needed — the `/command` menu entry is UI-only.

### Extension: push on connect

The extension's `sendModelsAndSkills()` function already calls
`pi.getCommands()` and filters by `source === "skill"`. A new `sendCommands()`
function (called alongside it in the `onSyncRequest` callback) filters by
`source === "extension"` and sends via `commands_list`.

### Web app: state in useRelay

The `useRelay` hook adds `availableCommands` state, a `commands_list` handler
(idiomatically identical to the `skills_list` handler), and returns the value.

### Web app: slash menu entry

`PI_COMMANDS` gains `{ name: "command", description: "List extension-registered
commands" }`. A `"command"` submenu renders the command list with the same
layout as the `"skill"` submenu (name + description, keyboard navigation,
filter-as-you-type). Selecting a command calls `onFillInput("/<name> ")`.

### Commands are sent as user messages

When the user submits `/<name> <args>`, `handleSendCommand` in App.tsx does not
recognize it as a known `PiCommand` kind (model/skill/prompt/compact), so the
fallthrough sends `user_message` with text `"/<name> <args>"`. Pi's built-in
slash routing on the extension side handles execution. This is the same path
that typing `/web-sync connect` manually already takes today.

### Follows existing patterns

The `commands_list` push-on-sync, `useRelay` state, and submenu component are
idiomatic copies of the existing `skills_list` pattern — not a new architecture.
No ADRs are contradicted.

## Testing Decisions

### What makes a good test

- Test the wire message contract: the protocol package's types are the source of
  truth; the web app handler accepts the declared shape.
- Test the UI interaction at the component level: slash menu renders the command
  submenu when filtered, fills input on click.
- Test the naming: the commands that appear in the submenu are the same ones
  `pi.getCommands()` returns filtered by `source === "extension"`.
- Do NOT test the pi API (`pi.getCommands()`) itself — that's pi's concern.

### Prior art

- `skills_list` handling in `useRelay.ts` (same pattern: state, message handler,
  return value).
- `"skill"` submenu in `SlashMenu.tsx` (same pattern: filtered list, keyboard
  nav, `onFillInput("/skill:name ")`) — the command submenu is the same minus
  the `:` separator.

## Out of Scope

- **Refresh mechanism.** The command list is pushed once on connect, same as
  models/skills. A reconnect refreshes it. No dedicated refresh command.
- **Filtering by source in the UI.** The submenu always shows extension commands
  only. Built-in commands and prompt templates have their own menu entries.
- **Typed `pi_command` for extension commands.** This spec adds discovery only.
  If later we want structured responses from extension commands (beyond what
  `user_message` fallthrough provides), that's a separate effort.
- **Showing built-in commands.** Pi's built-in interactive commands (like the
  pi terminal's `/model` or `/settings`) are not listed — they are not returned
  by `pi.getCommands()`.

## Further Notes

- The total change is small (~30 lines across 5 files) because the pattern
  already exists and the routing already works.
- The term "command" in the slash menu refers to pi extension-registered
  commands; the existing `PI_COMMANDS` entries (`model`, `skill`, etc.) are
  "PiCommand kinds" — a different concept. This distinction is invisible to
  users but important during implementation.