# `/command` Slash Entry Specification

## Problem

The web app's slash menu (`/` in chat input) exposes four commands: `model`,
`skill`, `prompt`, `compact`. Pi extensions register many more commands via
`pi.registerCommand()` (e.g., `/web-sync`, `/review`, `/deploy`), but the web
app user has no way to discover them. They must already know the command name
to type it manually.

Typing an unknown `/command_name` already works — the web app's
`handleSendCommand` falls through to sending it as a `user_message`, and pi
routes it — but there's no discovery UI.

## Goal

Add a `/command` entry to the slash menu that lists all extension-registered
commands from pi. The user can select one (filling the input with `/<name> `),
then add arguments, then send — same UX as `/skill` and `/prompt`.

## Design

### How it works

1. On relay connect, the extension pushes a `commands_list` message (same
   pattern as `skills_list` / `models_list`).
2. The web app stores the list as `availableCommands`.
3. The slash menu shows `/command` as a top-level entry.
4. Typing `/command ` (with a space) opens a submenu of available commands.
5. Clicking a command calls `onFillInput("/<name> ")`.
6. The user types arguments, hits send, and the full `/<name> <args>` is sent
   as a `user_message` (via the existing fallthrough in `handleSendCommand`).

### No new PiCommand kind needed

The `/command` entry does not send a `pi_command`. It fills the input so the
user can type and send as a regular message. Pi's built-in slash routing
handles it. This is the same path `/web-sync connect` already takes when typed
manually.

## Changes

### 1. Protocol — `packages/protocol/src/index.ts`

- Add `"commands_list"` to the `MessageType` union.
- Add exported `CommandInfo` interface (`{ name, description?, source }`).
- Add exported `CommandsListPayload` interface (`{ commands: CommandInfo[] }`).

### 2. Extension — `packages/extension/index.ts`

- Add `sendCommands()` function alongside `sendModelsAndSkills()`:
  ```
  const allCommands = pi.getCommands();
  const commands = allCommands
    .filter((cmd) => cmd.source === "extension")
    .map((cmd) => ({ name: cmd.name, description: cmd.description, source: cmd.source }));
  client.send({
    type: "commands_list",
    sessionId,
    payload: { commands },
  });
  ```
- Call `sendCommands()` inside the `onSyncRequest` callback, after
  `sendModelsAndSkills()` and `sendPromptsList()`.

### 3. Web app — `packages/webapp/src/hooks/useRelay.ts`

- Export `CommandInfo` type (re-export from protocol or define locally —
  protocol's `CommandInfo` from the re-export chain).
- Add `availableCommands` state: `useState<CommandInfo[]>([])`.
- Add `"commands_list"` handler in the message listener (same pattern as
  `skills_list` / `models_list`).
- Add `availableCommands` to the return value.

### 4. Web app — `packages/webapp/src/components/SlashMenu.tsx`

- Add a top-level entry to `PI_COMMANDS`:
  ```
  { name: "command", description: "List extension-registered commands" }
  ```
- Add a `"command"` submenu (same structure as the `"skill"` submenu):
  - Title / back button.
  - Filter by `submenuQuery`.
  - Each item shows command name + description.
  - On click: `onFillInput("/<name> ")`.
- Add `"command"` to `activeSubmenu` state transitions when user types space
  after `command`.
- Add keyboard navigation (same up/down/enter as existing submenus).
- In the main menu description, show count when available:
  ```
  cmd.name === "command" && availableCommands.length > 0
    ? `${cmd.description} (${availableCommands.length} available)`
  ```
- Accept `availableCommands` prop.

### 5. Web app — `packages/webapp/src/components/Chat.tsx`

- Import `CommandInfo` from useRelay.
- Add `availableCommands: CommandInfo[]` prop to `ChatProps`.
- Pass it through to `SlashMenu`.

### 6. Web app — `packages/webapp/src/App.tsx`

- Destructure `availableCommands` from `useRelay()` return.
- Pass `availableCommands` to `<Chat>`.

## Out of scope

- **Sending `pi_command` to invoke extension commands.** The `/command` entry
  fills the input; the existing `user_message` fallthrough handles routing.
  If later we need a typed `pi_command` for extension commands (e.g., to
  receive a structured response), that's a separate effort.
- **Refresh mechanism.** The command list is pushed once on connect, same as
  models/skills. No dedicated refresh command. A reconnect refreshes it.
- **Filtering by source.** The slash menu filters to `source === "extension"`.
  Built-in commands and prompt templates have their own entries.