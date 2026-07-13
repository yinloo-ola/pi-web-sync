---
id: 0027
title: "Model discovery via relay"
type: task
parent: 0019
blocked_by: [0022, 0026]
assigned: null
status: open
triage: ready-for-agent
---

# 0027 — Model discovery via relay

**What to build:** The extension sends available models to the webapp on connect. The `/model` sub-menu in the slash menu shows actual models from pi's registry, so users can switch models without knowing the exact model IDs.

**Blocked by:** 0022 (relay protocol — needs `models_list` message type) + 0026 (slash menu — needs the menu infrastructure)

**Status:** ready-for-agent

- [ ] Extension: on connect, query `ctx.modelRegistry` for available models and emit `models_list` message
- [ ] Webapp: receive `models_list` and store available models in state
- [ ] Slash menu: when `/model` is selected, show a sub-menu with available models from the `models_list` payload
- [ ] Show current model as selected (if detectable from relay or pi status)
- [ ] Selecting a model sends `/model <provider>/<id>` as a `pi_command` message
- [ ] Verify the model list matches what pi has available
- [ ] Verify model switching works end-to-end (webapp → relay → pi)
- [ ] Add tests for model list reception and sub-menu rendering