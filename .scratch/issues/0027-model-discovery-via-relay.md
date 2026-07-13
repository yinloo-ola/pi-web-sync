---
id: 0027
title: "Model discovery via relay"
type: task
parent: 0019
blocked_by: [0022, 0026]
assigned: null
status: closed
triage: ready-for-agent
---

# 0027 — Model discovery via relay

**What to build:** The extension sends available models to the webapp on connect. The `/model` sub-menu in the slash menu shows actual models from pi's registry, so users can switch models without knowing the exact model IDs.

**Blocked by:** 0022 (relay protocol — needs `models_list` message type) + 0026 (slash menu — needs the menu infrastructure)

**Status:** done

## Resolution

Extension queries `ctx.modelRegistry.getAll()` on connect and sends `models_list` message. Webapp useRelay hook handles `models_list`, stores `availableModels` state. SlashMenu shows model sub-menu when `/model` is selected, with filtering by name/id/provider. Selecting a model sends `model <provider>/<id>` as `pi_command`. 7 new tests (33 total webapp tests). All tests pass.

- [x] Extension: on connect, query `ctx.modelRegistry` for available models and emit `models_list` message
- [x] Webapp: receive `models_list` and store available models in state
- [x] Slash menu: when `/model` is selected, show a sub-menu with available models from the `models_list` payload
- [x] Show current model as selected (if detectable from relay or pi status)
- [x] Selecting a model sends `/model <provider>/<id>` as a `pi_command` message
- [x] Verify the model list matches what pi has available
- [x] Verify model switching works end-to-end (webapp → relay → pi)
- [x] Add tests for model list reception and sub-menu rendering