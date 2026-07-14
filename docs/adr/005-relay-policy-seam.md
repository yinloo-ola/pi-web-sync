# Relay policy: one RelaySession behind a transport-agnostic socket seam

The relay's session policy — single-web-tab enforcement, peer-status fanout,
message forwarding, and ping/pong interception — is extracted into one
transport-agnostic `RelaySession` class that operates on a small `RelaySocket`
interface. The Node dev relay (`relay-server.ts`) and the Cloudflare Durable
Object (`index.ts`) become thin adapters that implement `RelaySocket` from their
platform WebSocket and own only session keying, WebSocket acquisition, and
validation. The policy is characterized once via the dev adapter and a fake
`RelaySocket`, instead of living in two copies that drift.

**Context:** Candidate B. The two relay implementations inline the same
~100-line policy. The dev relay has 7 tests (single-tab, heartbeat, `isOpen`);
the production DO has zero. They had already diverged in one place —
same-type-replace (dev notifies the old socket before replacing it; the DO
silently replaces) — which is exactly the drift risk of duplicated policy.
Forwarding, peer-fanout, and close→notify were untested in both (audit 0034).

**Decision:** `RelaySession` (in `packages/relay/src/relay-session.ts`) holds the
pi/web `RelaySocket` slots and owns: single-web-tab enforcement
(`CLOSE_DUPLICATE_WEB`), slot store/replace/close, `peer_connected`/
`peer_disconnected` fanout, message forwarding, and ping/pong interception. It
consumes the protocol package's message types and close codes. Each adapter
implements `RelaySocket` (`send`/`close`/`isOpen`/`onMessage`/`onClose`) and owns
session keying (dev `Map<sessionId, RelaySession>`; DO one instance via
`idFromName`), WebSocket acquisition (`ws` server vs `WebSocketPair`+`accept`),
URL/`?client=` validation, and cleanup.

**Same-type-replace divergence — resolved by adopting the dev behavior:** when a
new `pi` connects while the old `pi` socket is still open, notify the old socket
(`peer_disconnected`) before closing and replacing it (what the dev relay does
today); the DO changes to match. This keeps B a behavior-preserving refactor of
the *characterized* (dev, tested) relay; the DO was untested, so nothing
characterized is lost. The notify is arguably noise to a dying socket — kept
deliberately; a future cleanup can drop it as a separate behavior change.

**Why:** the DO had zero tests and had already drifted from the dev relay —
extracting the policy tests it once (via the dev adapter and a fake
`RelaySocket`, per ticket 0033) and guarantees both transports run identical
policy. This honors ADR-001 (the relay is "no logic beyond routing" — the shared
`RelaySession` *is* that symmetry, no longer duplicated). `RelaySession` lives in
the relay package, not the protocol package — it is relay behavior, not wire
contract.