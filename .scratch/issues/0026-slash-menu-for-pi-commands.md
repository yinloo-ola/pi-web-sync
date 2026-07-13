---
id: 0026
title: "Slash menu for pi commands"
type: task
parent: 0019
blocked_by: [0022]
assigned: null
status: open
triage: ready-for-agent
---

# 0026 — Slash menu for pi commands

**What to build:** Typing `/` in the webapp input shows a dropdown of available pi commands (`/model`, `/skill`, `/compact`). Selecting a command sends it to pi via the relay. Users can control pi from the browser without switching back to the terminal.

**Blocked by:** 0022 (relay protocol — needs `pi_command` message type)

**Status:** ready-for-agent

- [ ] Create a new `SlashMenu` component that appears when the user types `/` as the first character in the input
- [ ] Show available commands: `model`, `skill`, `compact` — each with a short description
- [ ] Filter commands by prefix as the user types (e.g., `/mo` filters to `model`)
- [ ] Send selected command as a `pi_command` message via the relay
- [ ] Extension: handle `pi_command` messages and route them to `pi.sendUserMessage()`
- [ ] Dismiss the menu on Escape key or clicking outside
- [ ] Select a command on Enter or click
- [ ] Show brief feedback when a command is sent (e.g., "Command sent to pi")
- [ ] Add tests for slash menu rendering, filtering, and command dispatch