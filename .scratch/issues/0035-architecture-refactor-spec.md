---
id: 0035
title: "Architecture refactor: protocol package, typed commands, relay policy seam"
type: task
parent: null
blocked_by: []
assigned: null
status: done
triage: ready-for-agent
---

# Architecture refactor: protocol package, typed commands, relay policy seam

Implements the locked decisions from the closed wayfinder map **0028** ("Deepen
the wire protocol & relay architecture"). Decision record: map 0028 and child
tickets 0029–0034. Hard-to-reverse choices: **ADR-004** (protocol package is
private; extension is type-only with an inline builder) and **ADR-005**
(RelaySession/RelaySocket seam; same-type-replace adopts the dev behavior).
Characterization gates: the coverage audit, ticket **0034**.

This is a **behavior-preserving refactor**. Every change lands behind a
characterization test that locks current behavior first.

## Problem Statement

The pi-web-sync wire protocol and relay behavior have no home of their own. The
message types live inside a *consumer* (the extension plugin); the close codes
are defined in the relay and mirrored as a bare magic number in the web app; the
WebSocket URL format is constructed in three places and parsed in two; the
pi-command vocabulary is a free-form string parsed differently on each side; and
the relay's session policy — single-browser-tab enforcement, peer-status fanout,
message forwarding, heartbeat interception — is inlined in two separate transport
implementations that have already diverged from each other in at least one place.
The project's own lessons file codifies the tax: "when duplicating a type across
packages, add a comment noting where the mirror lives and that they must stay in
sync." A constraint enforced by comments and hand-synced mirrors is a missing
module, and the duplicated relay policy is an untested-against-each-other drift
hazard (the production Durable Object has zero CI tests).

## Solution

Deepen three shallow areas into proper modules, as a behavior-preserving refactor
gated by characterization tests:

- **A — protocol package:** extract the wire contract (types, close codes, URL
  builder/parser, command-union home) into one private workspace package.
- **D — typed commands:** replace the string pi-command protocol with a typed
  discriminated union on the wire.
- **B — relay policy seam:** extract the relay policy into one transport-agnostic
  module behind a thin socket interface, so the Node dev relay and the Cloudflare
  Durable Object become adapters rather than copies.

After the refactor the contract lives once, the command vocabulary is
compiler-checked, and the relay policy is characterized once and proven identical
across both transports.

## User Stories

**As a maintainer of pi-web-sync:**

1. As a maintainer, I want the wire-protocol types to live in their own module, so that adding a message type is a single edit instead of a cross-package change.
2. As a maintainer, I want the close codes defined in one place, so that a value change can't silently drift between the relay and the web app.
3. As a maintainer, I want the WebSocket URL format owned by one module, so that a client and the relay can never disagree on the path shape and fail to connect.
4. As a maintainer, I want the pi-command vocabulary to be a typed contract, so that the web app cannot construct a command the extension doesn't understand.
5. As a maintainer, I want the relay's session policy to live in one module, so that the Durable Object can no longer silently diverge from the dev relay.
6. As a maintainer, I want the refactor proven behavior-preserving by characterization tests, so that no user-visible behavior changes while I restructure the code.
7. As a maintainer, I want the protocol package to stay private to this monorepo, so that I don't take on a second npm publish and version-sync burden.
8. As a maintainer, I want the extension's distribution model unchanged (no build step), so that ADR-003 still holds after the refactor.
9. As a maintainer, I want the production Durable Object exercised in CI, so that a WebSocket-pair wiring bug is caught before deploy rather than only by hand.
10. As a maintainer, I want characterization tests written before each extraction, so that I can prove the refactored module behaves identically to the original.

**As a contributor to pi-web-sync:**

11. As a contributor, I want to add a relay message type by editing a single file in the protocol package, so that I don't have to touch three packages in lockstep.
12. As a contributor, I want to add a new pi-command by extending a union and adding one match arm, so that the compiler finds every site that must handle it.
13. As a contributor, I want to understand the relay by reading one policy module, so that I don't have to reconcile two copied implementations.
14. As a contributor, I want the URL parsing logic in one place, so that I don't hunt for where a path format is defined.
15. As a contributor, I want to reason about command flow through a typed object, so that I don't reverse-engineer an implicit string format.
16. As a contributor, I want the relay policy testable through the existing real-WebSocket harness, so that I can iterate quickly on policy behavior.

**As a self-hoster (end user) of pi-web-sync:**

17. As a self-hoster, I want the web app and extension to behave identically after the refactor, so that my sync keeps working without surprises.
18. As a self-hoster, I want the model, skill, and compact commands to keep working the same way, so that I don't lose functionality when commands are typed.
19. As a self-hoster, I want the single-browser-tab policy preserved, so that a second tab is still rejected while the first is active and accepted once it closes.
20. As a self-hoster, I want message forwarding, peer-status, and heartbeat behavior unchanged, so that live sync reliability is unaffected.
21. As a self-hoster, I want conversation history recovery on reconnect to keep working, so that I don't lose context across reconnects.
22. As a self-hoster, I want zombie-connection detection to keep working, so that dead client connections are re-established automatically.

**As someone debugging or reviewing:**

23. As a reviewer, I want an ADR explaining why the protocol package is private and why the extension keeps an inline URL builder, so that I don't "fix" a deliberate decision.
24. As a reviewer, I want an ADR explaining the relay socket seam and the same-type-replace choice, so that I understand why the policy was extracted and which behavior is canonical.
25. As a debugger, I want the characterization tests to document the relay's current behavior, so that I can see exactly what the policy guarantees.

**As a future architect:**

26. As a future architect, I want candidate C (connection-half sharing) recorded as out of scope, so that the extension/webapp reconnect mirror isn't prematurely merged.
27. As a future architect, I want relay-side zombie detection recorded as out of scope, so that the relay's lack of client probing is a conscious decision rather than an oversight.

## Implementation Decisions

### New module: the protocol package (A)

A new **private workspace package** holds the wire contract: the `RelayMessage`
type and `MessageType` union, all payload interfaces, the close-code constants
(`CLOSE_DUPLICATE_WEB`, `CLOSE_INVALID_REQUEST`), the session-URL builder and
parser, and the `PiCommand` union plus its parse helper.

- It is **private — never published to npm.** The web app and relay depend on it
  as a normal workspace dependency (each bundler inlines it at build/deploy).
- The **extension depends on it as a type-only dev dependency.** Types are erased
  at runtime by pi's jiti transpiler, so the extension takes no runtime dependency
  and its no-build-step distribution (ADR-003) is unchanged.
- Because the extension cannot resolve a runtime import from a private package at
  an end user's install, the extension **keeps its existing inline session-URL
  construction** rather than importing the shared builder. A characterization test
  asserts that inline form agrees with the shared parser. The shared builder and
  parser remain the single source for the web app (build side) and the relay
  (parse side).
- `isOpen` / `OPEN` are transport liveness helpers, not wire contract; they stay
  in the relay. The share-link URL (the `?relay=` deeplink) is web-app routing,
  not the relay wire protocol; it stays with its consumer.

### Typed command protocol (D)

The on-wire `pi_command` payload changes from a free-form string to a typed
discriminated union. This type shape encodes the command vocabulary precisely:

```ts
type PiCommand =
  | { kind: "model"; provider: string; id: string }
  | { kind: "skill"; name: string; args?: string } // args opaque (instructions)
  | { kind: "compact" };
```

- The web app builds `PiCommand` values via a `parsePiCommand` helper in the
  protocol package; the extension receives a typed `PiCommand` and matches on its
  `kind`, deleting its string parser entirely. Anything that doesn't parse to a
  known command is sent as an ordinary user message.
- The relay is an oblivious forwarder (it only special-cases ping/pong), so it is
  unchanged — this is a **two-package coordinated change**.
- **No backwards-compatibility shim.** A skew between an updated extension and an
  un-updated web app (or vice versa) breaks commands until both are updated.
  Accepted for a self-hosted tool; the characterization tests preserve the old
  string-parsing behavior so a shim could be added cheaply later if needed.

### Relay policy seam (B)

The duplicated session policy is extracted into one module — a `RelaySession`
that operates on a small transport-agnostic socket interface. This interface is
the architectural seam (ADR-005):

```ts
interface RelaySocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly isOpen: boolean;
  onMessage(handler: (data: string) => void): void;
  onClose(handler: (code: number, reason: string) => void): void;
}
```

- **`RelaySession` owns:** single-web-tab enforcement, slot store/replace/close,
  `peer_connected`/`peer_disconnected` fanout, message forwarding, and ping/pong
  interception. It consumes the protocol package's message types and close codes.
- **Each transport becomes a thin adapter** that implements `RelaySocket` from its
  platform WebSocket and owns only: session keying (the dev relay keeps a map of
  sessions; the Durable Object is one instance per session id), WebSocket
  acquisition (the dev relay's server connection vs the Durable Object's
  `WebSocketPair`), URL/client validation, and cleanup.
- **The one behavioral divergence** between the two current implementations —
  whether the old socket is notified before being replaced by a same-type
  reconnect — is resolved by **adopting the dev relay's behavior** (notify, then
  close); the Durable Object changes to match. This keeps the refactor a
  behavior-preservation of the characterized (tested) relay. (This path only
  affects pi reconnecting — pi is never capped; it does not touch the web
  single-tab policy.)
- **The single-web-tab policy is preserved exactly:** a second web client is
  rejected while the first is open, and replaces it once the first has closed.

### Order

Implement **A** first (the protocol package), then **D** (commands ride on it),
then **B** (the relay extraction). Each step lands behind its characterization
gate.

## Testing Decisions

A good test for this refactor asserts **external behavior, not implementation
details** — the proof of safety is that the same external inputs yield the same
external outputs before and after. Tests are written at the **highest available
seam**, and no new seam is added where an existing one suffices.

**Seams:**

- **Protocol types** — the cross-package typecheck is the test (types are erased
  at runtime).
- **Close codes** — existing tests on both sides already pin the value (the relay
  asserts it closes with the duplicate-tab code; the web app asserts that code
  surfaces as "rejected").
- **Session URL** — a new round-trip characterization (builder → parser, plus the
  extension's inline builder) locks the format before it moves.
- **Web app command construction** — the existing slash-menu component tests
  adapt to assert typed `PiCommand` values.
- **Extension command handling** — the existing extension vitest harness is
  applied to the command handler, characterizing each branch's pi-API effect
  before the wire format changes.
- **Relay policy** — the existing **real-WebSocket** relay tests (the highest seam
  in the repo: live server, real clients) are augmented with the three untested
  behaviors: message forwarding, peer-status fanout, and close→notify. After
  extraction these same assertions run unchanged against `RelaySession` through
  the dev adapter — the behavior-preservation proof.
- **Durable Object** — a new **Miniflare smoke test** (via the Cloudflare vitest
  workers pool) drives a real pi↔web forwarding exchange plus the single-tab
  reject through the production Durable Object, guarding the adapter glue that no
  other seam covers.

**The fake-`RelaySocket` unit seam is deliberately not added.** The policy is
characterized at the higher, external real-WebSocket seam, which is what proves
the refactor safe; a lower unit seam would duplicate that coverage. (The
`RelaySocket` *interface* remains — it is the architectural seam — it is simply
not exercised through a fake test-double.)

**Prior art** (existing tests to match the style of): the real-WebSocket relay
test file (live server + ws clients), the extension client tests (an injected
mock WebSocket), the web app relay-hook tests (a stubbed global WebSocket), and
the slash-menu tests (React Testing Library).

**Characterization gates** (from the coverage audit, ticket 0034): the URL
round-trip before A's URL move; the command-handler branches before D's wire
change; the forwarding/fanout/close-notify behaviors before B's extraction.

## Out of Scope

- **Candidate C — connection-half sharing:** centralizing the extension/webapp
  reconnect logic or constants. The two connection halves remain as-is.
- **Relay-side zombie detection:** having the relay actively probe clients
  (relay-originated pings) so a half-open zombie web tab doesn't block a second
  tab until TCP timeout. The relay continues to only answer pings.
- **Publishing the protocol package to npm**, or adding a build/bundle step to
  the extension.
- **A backwards-compatibility shim** for the command wire-format change.
- **Feature work inherited from the production-hardening effort:** multi-browser
  fanout, message ACKs / at-least-once delivery, relay authentication / rate
  limiting, and WebRTC migration.

## Further Notes

- The two hard-to-reverse decisions are recorded as **ADR-004** (protocol package
  is private; the extension is type-only with an inline builder) and **ADR-005**
  (the RelaySession/RelaySocket seam; same-type-replace adopts the dev behavior).
- The **coverage audit** (ticket 0034) defines the minimum characterization tests
  that gate each extraction; it is the authoritative source for the test plans.
- The decision record is the closed **wayfinder map (ticket 0028)** and its child
  tickets 0029–0034; this spec is the consolidated implementation handoff.
- The same-type-replace notification is arguably noise (it tells a dying socket
  it has disconnected); it is preserved deliberately so the refactor changes no
  characterized behavior, and can be dropped in a separate future change.
- The same-type-replace path only affects pi reconnecting (pi is never capped);
  it does not affect the web single-tab policy.