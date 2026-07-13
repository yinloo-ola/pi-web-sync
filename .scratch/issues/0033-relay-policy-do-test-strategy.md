---
id: 0033
title: "Relay policy: testing the production Durable Object"
type: grilling
parent: 0028
blocked_by: [0032]
assigned: yinlootan
status: closed
triage: ready-for-human
---

# 0033 — Relay policy: testing the production Durable Object

## Question

How much do we invest in testing the production Durable Object?

## Context

The `SessionDO` in `packages/relay/src/index.ts` has **zero CI tests** today.
Ticket 0010b (under `docs/plans/verification-do-0010b.md`) proved
transport-parity with the dev relay *by hand* under `wrangler dev`, but nothing
guards it — so the prod relay can drift unnoticed. Candidate B's extraction
(ticket 0032) is what makes the shared policy testable through a fake/dev
adapter, covering the deep module once. This ticket decides the remaining
investment in the prod path itself.

**Recommended answer:**

- **Policy coverage via a fake adapter** — the main win. The extracted
  `RelaySession` is exercised against an in-memory fake socket; the dev relay's
  augmented characterization tests (0032) effectively cover the policy the DO
  runs.
- **One Miniflare smoke test for the DO adapter glue** — guard the currently
  untested prod path cheaply: verify the DO's `fetch` does the WebSocket
  upgrade, maps `open/accept/close/send/isOpen` to the `RelaySession`, and
  relays one full pi↔web exchange. Recommend **yes** — low cost, closes the
  CI-untested gap that 0010b flagged.

**Decision points to confirm:**

- Exact coverage target (one smoke test? a small matrix?).
- Test infrastructure: Miniflare (`unstable_dev`) vs `wrangler dev` in CI.
  Recommend Miniflare (scriptable, no long-running server).

**Refactor safety:** this ticket *is* the safety net for the prod half of B; its
resolution defines the coverage that makes the DO adapter a safe refactor rather
than an unverified rewrite.

## Resolution

**Chosen: (i) — add a Miniflare smoke test for the DO adapter glue, including the
single-tab reject.**

**Test:** `@cloudflare/vitest-pool-workers` (Miniflare-based, scriptable in
vitest; reuses the relay's wrangler DO-binding config). Two assertions through
the real `SessionDO`:

1. **Forwarding** — connect a `pi` and a `web` WebSocket, send a message
   `pi→web`, assert the web leg receives it. Exercises the entire glue:
   `fetch` upgrade → `WebSocketPair` → `accept` → `RelaySocket` wrap →
   `RelaySession.accept` → forward.
2. **Single-tab reject** — connect a `web`, then a second `web`; assert the
   second is closed with `CLOSE_DUPLICATE_WEB`. Covers the close-code path
   through the glue.

Together these prove the DO wires the shared policy correctly through the real
Workers runtime — both the forward path and the single-tab enforcement.

**Scope rationale:** the policy details (single-tab logic, fanout, heartbeat)
are covered by the fake-`RelaySocket` tests on `RelaySession` (ticket 0032);
these two DO assertions guard the *adapter glue* — the only DO-specific code —
so a `WebSocketPair`/wiring bug is caught in CI.

**What this closes:** the audit's (0034) "production `SessionDO` has zero CI
tests" finding. After 0032 the policy can't drift between transports; this test
guards the remaining DO-specific glue.

**Infrastructure:** `@cloudflare/vitest-pool-workers` (new devDep in
`packages/relay`); coexists with the existing node-env `relay-server.test.ts`.
Rejected `wrangler dev` in CI (heavier; long-running server) and raw
`unstable_dev` (lower-level than needed).

**No ADR** — reversible test-strategy choice, not surprising. **This is the
last ticket; resolving it reaches the map's destination** (see map 0028).