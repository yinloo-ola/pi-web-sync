---
id: 0026
title: "Slash menu for pi commands"
type: task
parent: 0019
blocked_by: [0022]
assigned: null
status: closed
triage: ready-for-agent
---

# 0026 — Slash menu for pi commands

**What to build:** Typing `/` in the webapp input shows a dropdown of available pi commands (`/model`, `/skill`, `/compact`). Selecting a command sends it to pi via the relay. Users can control pi from the browser without switching back to the terminal.

**Blocked by:** 0022 (relay protocol — needs `pi_command` message type)

**Status:** done

## Resolution

Created `SlashMenu` component with keyboard navigation (ArrowUp/Down, Enter, Escape), prefix filtering, and click-outside dismissal. Chat component shows menu when input starts with `/`. App sends `pi_command` message via relay. Extension routes `pi_command` to `pi.sendUserMessage()`. 8 new tests (26 total webapp tests). All tests pass.

- [x] Create a new `SlashMenu` component that appears when the user types `/` as the first character in the input
- [x] Show available commands: `model`, `skill`, `compact` — each with a short description
- [x] Filter commands by prefix as the user types (e.g., `/mo` filters to `model`)
- [x] Send selected command as a `pi_command` message via the relay
- [x] Extension: handle `pi_command` messages and route them to `pi.sendUserMessage()`
- [x] Dismiss the menu on Escape key or clicking outside
- [x] Select a command on Enter or click
- [x] Show brief feedback when a command is sent (e.g., "Command sent to pi")
- [x] Add tests for slash menu rendering, filtering, and command dispatch