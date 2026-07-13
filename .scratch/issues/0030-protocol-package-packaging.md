---
id: 0030
title: "Protocol package: packaging & distribution"
type: grilling
parent: 0028
blocked_by: [0029]
assigned: yinlootan
status: closed
triage: ready-for-human
---

# 0030 — Protocol package: packaging & distribution

## Question

How is the protocol package packaged, and how does each of the three packages
depend on it?

## Context

The main branch is settled by fact (see map Notes): because the extension's use
of the wire types is **type-only** (every import is `import type`; the extension
references no close codes; `extension/types.ts` is pure declarations), the
protocol package can be a **private workspace package, never published to npm**.
The extension takes it as a devDep — types are erased at runtime by jiti, so
ADR-003's "no build step" is untouched. The webapp bundles it at vite build; the
relay bundles it at wrangler deploy.

**Recommended answer:**

- New workspace package `packages/protocol`, name `pi-web-sync-protocol`,
  `private: true` (never published).
- `packages/extension`: `"pi-web-sync-protocol": "*"` as a **devDependency**
  (type-only). Its `files` array stops shipping `types.ts` for cross-package
  import.
- `packages/webapp`, `packages/relay`: regular workspace `"dependencies"`; each
  bundler inlines it.

**Decision points to confirm:**

- Exact package name.
- Publish anyway? (Recommend **no** — nothing external consumes it.)
- **ADR?** Recommend **yes** — this is a distribution decision (private vs
  published, type-only devDep) a future contributor will question, it's
  hard-to-reverse, and there were real alternatives (publish; or inline with a
  build step that would break ADR-003). Meets the domain-modeling ADR bar.

**Refactor safety:** the resolution must specify the regression coverage — a
clean workspace install plus each package's existing `tsc` / build / `vitest`
staying green is the proof. Consult the audit (0034).

## Resolution

**Chosen: option C — private package, extension inlines a tested builder.**
Recorded as
[ADR-004 — Protocol wire package: private workspace package, inline builder in the extension](../../docs/plans/completed/adr/004-protocol-package-distribution.md).

**Packaging:**
- New workspace package `packages/protocol`, name `pi-web-sync-protocol`,
  `"private": true` — **never published to npm**.
- **webapp, relay:** regular workspace `"dependencies"` entry; vite (webapp) and
  wrangler (relay) inline the package at build/deploy. They get full
  single-sourcing — builder, parser, close codes, types.
- **extension:** `"devDependencies"` entry, **type-only** (`import type`, erased
  by jiti at runtime → ADR-003's no-build-step untouched). The extension keeps
  its existing inline WebSocket-URL builder (`relay-client.ts:85`) rather than
  importing the shared one, because importing a runtime value would force
  publishing (or bundling — disproven) for the sake of one trivial function.

**Why not publish (option A) / bundle (option B):** see ADR-004. B is disproven
(`bundledDependencies` is broken with npm workspaces). A was rejected as
recurring release friction disproportionate to one line. The extension's inline
builder is guarded by the characterization test (ticket 0029's gate), extended
in implementation to assert it produces a URL the relay's shared parser accepts.

**Consequence for 0029:** the URL *parser/regex* and the webapp *builder* live
exactly once (in the package); the extension's *builder* is a deliberate,
tested mirror — relaxing 0029's "exactly once" to "once in the package plus one
characterized line in the extension." Accepted per ADR-004.

**Refactor-safety gate:** clean workspace install + each package's existing
`tsc`/build/`vitest` green (per audit 0034); plus the URL round-trip
characterization test from 0029 covering the extension's inline builder.

**ADR-004 created.** This is a leaf ticket (nothing blocked on it). No new
tickets, no fog graduated beyond noting the ADR is done, no out-of-scope rulings.