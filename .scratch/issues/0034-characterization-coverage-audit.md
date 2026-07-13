---
id: 0034
title: "Characterization coverage audit for the A/B/D refactors"
type: research
parent: 0028
blocked_by: []
assigned: yinlootan
status: closed
triage: ready-for-agent
---

# 0034 — Characterization coverage audit for the A/B/D refactors

## Question

What test coverage exists today, and what gaps would make the A / B / D
refactors unsafe?

## Context

This effort is a **refactoring** effort (see map 0028 Notes): every deepening
must be behavior-preserving, which requires a characterized baseline to prove
equivalence. This ticket is AFK — read the tests and the code and report
findings; it makes **no decisions**, it produces a gap-analysis asset the
decision tickets (0029 / 0031 / 0032 / 0033) reference when specifying their
safety nets.

## Scope of the audit

Inventory and assess:

- **Existing tests** — what each actually covers:
  - `packages/relay/src/relay-server.test.ts` (7 tests: close codes, heartbeat,
    single-browser-tab). Confirm it exercises the **dev relay only**.
  - `packages/webapp/src/hooks/useRelay.test.ts`, `components/SlashMenu.test.tsx`,
    `hooks/useLocalStorage.test.ts` (~33 tests).
  - `packages/extension/relay-client.test.ts`.
- **Untested / under-tested paths** the refactors will touch, especially:
  - The production `SessionDO` in `packages/relay/src/index.ts` — **zero CI
    tests** (0010b verified parity by hand only).
  - The pi-command round-trip: webapp `SlashMenu` builds → wire `{command:
    string}` → extension `handlePiCommand` parses. Is any of this characterized
    end-to-end?
  - URL construction in three places (extension `index.ts`, webapp `App.tsx` /
    `useRelay.ts`) vs. parsing in two (dev relay, DO) — any round-trip test?

## Output (linked asset)

A markdown summary under `docs/plans/` (e.g. `coverage-audit-0034.md`) listing:

1. What each existing test covers (one line each).
2. Current behavior that is un- or under-tested, ranked by refactor-relevance.
3. The **minimum characterization tests** that must exist *before* each of:
   - **0031** (D — the command wire-format change), and
   - **0032** (B — the relay policy extraction)
   are safe to land.

Link the asset from this ticket's resolution. The findings feed the test-plan
section of each design ticket's resolution.

## Resolution

**Done.** Audit complete; asset at
[`docs/plans/coverage-audit-0034.md`](../../docs/plans/coverage-audit-0034.md).
54 tests catalogued across 5 files.

**Headline finding:** the relay policy that B extracts — normal-message
forwarding, `peer_connected`/`peer_disconnected` fanout, and close→notify-other
— is **untested in both** relay implementations (the dev relay's 7 tests cover
only `isOpen`, heartbeat-intercept, and single-tab-reject; the production
`SessionDO` has zero CI tests). The extension's `handlePiCommand` (the behavior
D replaces) also has **zero** tests. Extracting/retyping these blind would be a
rewrite, not a refactor.

**Verdict:**
- **A is safe to start now** — types are erased (zero runtime risk), close-code
  values are indirectly pinned by existing tests on both sides; the one
  recommended pre-step is a URL round-trip test.
- **B (0032) and D (0031) are gated** by the *minimum-tests-before* lists in
  the asset. Their resolutions must adopt those lists as the gate that makes
  each a behavior-preserving refactor.
- The production-DO gap is ticket **0033**'s to resolve.

No new tickets, no fog graduated (the gaps were known; now sharpened into
concrete test lists the design tickets reference), no out-of-scope rulings.