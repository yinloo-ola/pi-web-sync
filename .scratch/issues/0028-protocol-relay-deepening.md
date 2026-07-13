---
id: 0028
title: "Deepen the wire protocol & relay architecture"
type: map
parent: null
blocked_by: []
assigned: null
status: closed
---

# Deepen the wire protocol & relay architecture

## Destination

A spec — locked decisions for three architecture deepenings, **each with the
characterization/regression coverage that makes it a behavior-preserving
refactor**, ready to hand off for implementation:

- **A** — extract the wire protocol into its own module (types + close codes +
  URL builders + the command-union home), killing the cross-package mirrors.
- **D** — type the pi-command round-trip (replace the free-form `{command:
  string}` with a discriminated union).
- **B** — extract the relay policy from the two duplicated transports
  (`relay-server.ts` dev + `index.ts` Durable Object) behind a
  transport-agnostic seam.

Frontier runs **A → D → B**: A is the foundation (D rides on it, B wants it),
D is the quick follow-up, B is the deep back-half work.

## Notes

- **Domain:** pi-web-sync — three packages speaking one WebSocket wire protocol:
  `packages/extension` (pi plugin, Node, runs under jiti — no build step per
  ADR-003), `packages/relay` (CF Worker + `SessionDO` Durable Object, plus
  `relay-server.ts` Node dev relay), `packages/webapp` (React + Vite SPA).
- **Skills every session should consult:** `/grilling`, `/domain-modeling` for
  decisions; consult the characterization audit asset (ticket 0034) before
  resolving any behavior-changing ticket.
- **This is a refactoring effort — every deepening must be behavior-preserving.**
  Characterize current behavior *before* extracting; each ticket's resolution
  must specify the characterization/regression coverage that gates the change.
  Existing tests are the starting baseline:
  - relay: `packages/relay/src/relay-server.test.ts` — 7 tests (close codes,
    heartbeat, single-browser-tab). **Note: covers the dev relay only; the
    production `SessionDO` in `index.ts` has zero CI tests.**
  - webapp: `useRelay.test.ts` + `SlashMenu.test.tsx` + `useLocalStorage.test.ts`
    (~33 tests).
  - extension: `relay-client.test.ts`.
  - Ticket 0034 audits these and identifies the gaps.
- **Key fact (settles A's distribution branch):** the extension's use of the
  wire types is **type-only** — every import is `import type`, the extension
  references no close codes, and `extension/types.ts` is pure declarations
  (zero runtime values). Therefore the protocol package is a **private workspace
  package, never published to npm**; the extension takes it as a devDep (types
  erased at runtime by jiti — ADR-003's no-build-step untouched), while the
  webapp bundles it at vite build and the relay bundles it at wrangler deploy.
- **Standing preferences (confirmed with the user):**
  - **Greedy protocol scope** — anything that must agree across ≥2 packages and
    is currently duplicated *is* protocol: types, close codes, the
    `/session/:id?client=pi|web` URL builders (retires the `lessons.md` "URL
    format must match" risk), and the command-union home. **Exclude** the
    reconnect constants (client-side config → candidate C, out of scope).
  - **Change the on-wire command payload** to the typed shape (self-hosted;
    extension+webapp deploy together; the relay is a dumb forwarder).
  - **Test the relay policy via a fake/dev adapter** (covers the deep module)
    **plus one Minifarle smoke test** for the DO adapter (guards the
    currently-untested prod path).
- **ADR respect:** ADR-001 (relay = routing only — a shared policy module *is*
  that symmetry, no longer duplicated), ADR-002 (session-id-as-secret),
  ADR-003 (extension = npm package, no build step). Tickets 0030 and possibly
  0032 may author ADRs on resolution.
- **Destination is a SPEC.** Implementation/migration is a separate
  post-handoff effort (out of scope here — exit fog with `/wayfinder off` once
  the spec is complete).
- **Tracker:** local markdown under `.scratch/issues/` — see
  `docs/agents/issue-tracker.md`.

## Decisions so far

<!-- one line per closed ticket: gist + link. Empty until the first ticket closes. -->

- [Characterization coverage audit for the A/B/D refactors](0034-characterization-coverage-audit.md) — 54 tests catalogued (relay 7, extension relay-client 10, webapp 37); **relay forwarding / peer-fanout / close→notify and extension `handlePiCommand` are untested**; **A is safe to start**, **B (0032) and D (0031) are gated** by the minimum-tests-before lists in [`docs/plans/coverage-audit-0034.md`](../docs/plans/coverage-audit-0034.md).
- [Protocol package: scope & contents](0029-protocol-package-scope.md) — **greedy scope locked**: types + close codes + URL builder **and parser** + `PiCommand` home go in the protocol package; reconnect constants, `isOpen`/`OPEN`, and the share-link URL stay out; URL round-trip characterization test is the pre-move gate (per audit 0034).
- [Protocol package: packaging & distribution](0030-protocol-package-packaging.md) — **option C**: `pi-web-sync-protocol` is a private workspace package, **never published**; webapp+relay depend on it normally (bundled at build), extension is a **type-only devDep** and keeps a characterized inline URL builder; recorded as [ADR-004](../docs/plans/completed/adr/004-protocol-package-distribution.md).
- [Type the pi-command round-trip](0031-type-pi-command-roundtrip.md) — **`PiCommand` discriminated union** (`model`/`skill`/`compact`) lives in the protocol package; on-wire `pi_command` payload becomes typed; extension matches on `.kind` (string parser deleted), webapp builds via a centralized `parsePiCommand`; relay untouched (2-package change); **skew accepted** (no compat shim); extension stays type-only (consistent with ADR-004).
- [Relay policy: the transport-agnostic seam](0032-relay-policy-seam.md) — extract `RelaySession` (policy: single-tab / fanout / forward / heartbeat) behind a `RelaySocket` interface in the **relay** package; dev + DO become thin adapters owning keying / acquisition / validation; **same-type-replace divergence resolved by adopting dev behavior (i)** (DO changes to match); the `RelaySocket` interface is the fake-able test surface for 0033; recorded as [ADR-005](../docs/plans/completed/adr/005-relay-policy-seam.md).
- [Relay policy: testing the production Durable Object](0033-relay-policy-do-test-strategy.md) — **(i) Miniflare smoke test** via `@cloudflare/vitest-pool-workers`: one end-to-end pi↔web forwarding exchange through the real `SessionDO` (proves the adapter glue — `WebSocketPair`→`accept`→`RelaySocket` wrap→`RelaySession.accept`→forward); plus the single-tab reject (`CLOSE_DUPLICATE_WEB` via the DO); closes the audit's "DO zero-CI-tests" gap. No ADR.

## Not yet specified

<!-- fog: in-scope decisions not yet sharp enough to ticket -->

- **Implementation/migration tickets** graduate only if the destination is
  redrawn to carry execution into the map; by default they are the next effort
  after handoff.
- **Reconnect-constant centralization (candidate C)** — adjacent to the
  protocol package but out of scope here; revisit if a future C effort opens.

**Destination reached.** All three deepenings are specced, each with its
characterization gate from the audit (0034): **A** — scope (0029) + packaging
([ADR-004](../docs/plans/completed/adr/004-protocol-package-distribution.md));
**D** — typed `PiCommand` (0031); **B** — the transport-agnostic seam
([ADR-005](../docs/plans/completed/adr/005-relay-policy-seam.md)) +
production-DO test strategy (0033). Every ticket's resolution names its
refactor-safety coverage. No decision fog remains. Implementation is the
handoff — a separate effort after `/wayfinder off` (see Out of scope). The map
is closed.

## Out of scope

<!-- work consciously ruled out of this effort -->

- **Candidate C — connection-half sharing / centralizing the reconnect
  constants.** Not chosen for this effort; the extension `RelayClient` ↔ webapp
  `useRelay` mirror stays as-is. Its own potential effort.
- **Relay-side zombie detection.** The maintainer wants a half-open zombie web
  tab to NOT block a 2nd tab — but the relay only answers pings (never probes),
  so a zombie looks `OPEN` until TCP times out. Making the relay actively probe
  clients (relay-originated ping, close on no-pong) is a behavior change /
  feature, out of scope for this behavior-preserving refactor; candidate for its
  own effort. (See ticket 0032.)
- **Implementation of the spec.** This map produces decisions, not code. The
  refactor lands in a separate effort after `/wayfinder off` and handoff.
- **Feature scope inherits map 0001** ("pi-web-sync production hardening"):
  multi-browser fanout, message ACKs / at-least-once delivery, relay auth &
  rate limiting, and WebRTC migration (ADR-001) remain out of scope.