---
id: 0031
title: "Type the pi-command round-trip"
type: grilling
parent: 0028
blocked_by: [0029, 0034]
assigned: yinlootan
status: closed
triage: ready-for-human
---

# 0031 — Type the pi-command round-trip (candidate D)

## Question

What is the typed shape of a pi-command, and does the on-wire payload change?

## Context

Today the command vocabulary is encoded twice with no shared authority: the
webapp's `SlashMenu.tsx` hardcodes `PI_COMMANDS` (`model`/`skill`/`compact`) and
builds strings (`"model provider/id"`, `"/skill:name args"`); the extension's
`handlePiCommand` re-parses them by `split(" ")`, then `indexOf("/")`, then
`startsWith("skill:")`. The wire payload is `{ command: string }` — a shallow
protocol where the interface (one string) carries all the complexity.

**Recommended answer:**

- A discriminated union living in the protocol package (candidate A, ticket 0029):
  `{ kind: "model"; provider; id } | { kind: "skill"; name; args? } | { kind:
  "compact" }`.
- Constructors (`buildModelCommand`, `buildSkillCommand`, …) live in the
  protocol package; `SlashMenu` builds typed objects, the extension matches on
  `.kind`. The string parsers on both sides are deleted.
- **Change the on-wire `pi_command` payload** to the typed shape (recommend
  **yes**). It's self-hosted, extension+webapp deploy together, and the relay is
  a dumb forwarder — so it's a coordinated two-package change, not three.
- Confirm the `skill:name args` → `{ kind: "skill"; name; args }` mapping.

**Refactor safety (see map Notes):** this is a behavior-changing refactor, so the
resolution must specify a **characterization test of the current command
round-trip** (every command the webapp can emit today → the action the extension
takes) locked *before* the wire-format changes, proving the typed version is
equivalent. **Blocked by the audit (0034)** so that baseline exists first.

## Resolution

**Chosen: typed `PiCommand` + on-wire payload change; accept deployment skew (i).**

**`PiCommand`** (in the protocol package, per 0029):
```ts
type PiCommand =
  | { kind: "model"; provider: string; id: string }
  | { kind: "skill"; name: string; args?: string }  // args opaque
  | { kind: "compact" };
```

**On-wire:** `pi_command` payload is the typed `PiCommand`, replacing
`{ command: string }`.

**Flow:**
- **Webapp** produces `PiCommand` via `parsePiCommand(slashText): PiCommand | null`
  in the protocol package (the one remaining parser, centralized on the build
  side); `SlashMenu` and the `/…` text path both route through it. Unknown /
  malformed (`/foo`, `model` with no `/`) → sent as a regular `user_message`,
  folding the extension's current `else → sendUserMessage` up into the webapp
  (same observable effect).
- **Extension** matches on `.kind` — `model` → `modelRegistry.find(provider,id)`+
  `setModel`; `skill` → `sendMessage(`/skill:${name} ${args}`)`; `compact` →
  `ctx.compact()`. The string parser is **deleted entirely**.
- **Relay:** untouched (oblivious forwarder; only special-cases `ping`/`pong`) →
  a **2-package** coordinated change.

**Extension stays type-only (consistent with 0030/ADR-004):** `PiCommand` is a
 type; the extension `import type`s it and matches on the received `.kind` (a
 property of the payload, not an imported value). `parsePiCommand` and any
 constructors are webapp-side (bundled). So D adds **no runtime dependency** for
 the extension.

**Skew — accept breakage (i):** the extension (npm) and webapp (self-deployed)
update independently, so a skew window breaks commands until both update.
Accepted: document "update both together"; it's a self-hosted personal tool and
commands are a nice-to-have. The characterization tests below lock the old
string-parsing behavior, so re-adding a compat shim later is cheap if skew ever
bites.

**Refactor-safety gate (per audit 0034):** characterize the **current**
`handlePiCommand` string→action behavior first (model found / not-found /
no-API-key / usage; compact; skill with/without args; unknown→sendUserMessage).
After the refactor, `parsePiCommand` + the typed `.kind` matcher must produce
the **same pi-actions** for the same logical commands — that equivalence is the
proof of behavior-preservation.

**No ADR** — reversible type decision; the skew-acceptance is recorded here and
is low-stakes for a personal project (doesn't meet the 0030 bar). Leaf ticket
(nothing blocked on it). No new tickets, no fog graduated, no out-of-scope rulings.