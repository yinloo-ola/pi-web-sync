# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root (when it exists — created lazily by `/domain-modeling`)
- **`docs/plans/completed/adr/`** — read ADRs that touch the area you're about to work in

If these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md                          ← domain glossary (created by /domain-modeling)
├── docs/
│   ├── agents/                         ← skill config (this file, issue-tracker, triage-labels)
│   └── plans/completed/adr/            ← architectural decisions
│       ├── 001-websocket-relay.md
│       ├── 002-session-id-as-secret.md
│       └── 003-npm-package-extension.md
├── packages/
│   ├── extension/                      ← pi plugin (Node)
│   ├── relay/                          ← CF Worker + Durable Object
│   └── webapp/                         ← React + Vite SPA
└── .scratch/issues/                    ← issue tracker
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-001 (WebSocket relay) — but worth reopening because…_