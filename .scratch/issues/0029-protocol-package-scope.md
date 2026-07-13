---
id: 0029
title: "Protocol package: scope & contents"
type: grilling
parent: 0028
blocked_by: []
assigned: yinlootan
status: closed
triage: ready-for-human
---

# 0029 — Protocol package: scope & contents

## Question

What goes in the protocol package (candidate A), and what stays out?

## Context

The wire contract currently has no home of its own — its types live inside a
*consumer* (`packages/extension/types.ts`), its close codes live in the relay
(`packages/relay/src/close-codes.ts`) and are mirrored as a bare `4002` in the
webapp (`useRelay.ts:35`, `useRelay.test.ts:193`), and its URL shape
(`/session/:id?client=pi|web`) is constructed inline in three places and parsed
in two. `lessons.md` carries a rule that the client/server URL format "must
match exactly." This ticket decides the interface of the new deep module: what
it owns.

**Recommended answer (greedy on cross-boundary contracts):**

- **In:** `RelayMessage` / `MessageType` / all payload interfaces; the close-code
  constants (`CLOSE_DUPLICATE_WEB`, `CLOSE_INVALID_REQUEST`); the URL builders
  (`buildSessionWsUrl(relayUrl, sessionId, client)` + `parseSessionPath`) so the
  format is defined once; and the **command-union home** (candidate D lands its
  `PiCommand` discriminated union here).
- **Out:** the reconnect *constants* (`MAX_RETRIES`, `MIN_UPTIME_MS`,
  `PING_INTERVAL_MS`, `PONG_TIMEOUT_MS`) — client-side config, candidate C,
  out of scope. (`isOpen` / `OPEN` are transport helpers; they stay in the
  relay.)

**Refactor safety (see map Notes):** the resolution must specify the
characterization coverage gating each move — the existing close-code tests
relay + webapp already pin the `4002` value; the **URL round-trip needs a new
characterization test** (constructor → parser) locked *before* the builders
move, per the `lessons.md` URL-mismatch warning. Consult the audit (0034).

Blocked-by note: nothing. This is a frontier ticket — the scope decision that
unblocks 0030, 0031, and 0032.

## Resolution

**Confirmed (greedy scope).** The protocol package owns the wire contract —
anything ≥2 packages must agree on.

**In:**
1. `RelayMessage` / `MessageType` / all payload interfaces (from
   `extension/types.ts`).
2. Close-code constants `CLOSE_DUPLICATE_WEB`, `CLOSE_INVALID_REQUEST` (from
   `relay/close-codes.ts`).
3. URL builder **and** parser for `/session/:id?client=pi|web` —
   `buildSessionWsUrl(relayUrl, sessionId, client)` + `parseSessionPath(pathname)`
   — so the shape + regex live exactly once.
4. The **home** for `PiCommand` (candidate D). This ticket seats it here; ticket
   **0031** decides the union's shape.

**Out:** reconnect constants (candidate C); runtime validators like
`isRelayMessage` / typed `parseMessage` (YAGNI for this refactor).

**Borderline calls decided:**
- **(a) URL parser — IN.** The package includes the parser, not just the
  builder. This is the one place it grows beyond types+constants into runtime
  code; justified because builder-only would leave the format duplicated on the
  parse side — the exact `lessons.md` "URL must match exactly" risk we're
  killing. The relay bundles the package at deploy.
- **(b) `isOpen` / `OPEN` — OUT.** Transport liveness helper, not wire contract;
  stays in the relay. (B's adapter seam in 0032 will define its own liveness
  probe — that's 0032's call.)
- **(c) Share-link URL (`/session/:id?relay=…`) — OUT.** That's the webapp
  deeplink, not the relay wire protocol; stays with its consumer (a different
  URL from the WebSocket connection URL).

**Refactor-safety gate (per map Notes + audit 0034):** a URL round-trip
characterization test (`buildSessionWsUrl` → `parseSessionPath`, pinning the
exact string) must be locked *before* the builders move. Types and close-code
moves are already covered by existing tests on both sides — no new gate needed
there.

**No ADR from this ticket** — it's a reversible scope decision, not a
hard-to-reverse/surprising trade-off (doesn't meet the domain-modeling bar).
Ticket 0030 will assess ADR-worthiness for the packaging decision. No new
tickets, no fog graduated, no out-of-scope rulings.