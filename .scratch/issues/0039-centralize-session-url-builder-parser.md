---
id: 0039
title: "Centralize the session-URL builder + parser"
type: task
parent: 0035
blocked_by: [0036]
assigned: null
status: done
triage: ready-for-agent
---

# 0039 — Centralize the session-URL builder + parser

## What to build

Move the `/session/:id?client=pi|web` URL builder and parser into the protocol
package, so the format and its regex live exactly once. Add a round-trip
characterization test pinning the format (builder → parser). The web app uses the
shared builder, the relay uses the shared parser. The extension keeps its inline
builder (per ADR-004 it cannot take a runtime dependency on the private package)
but a test asserts that inline form agrees with the shared parser — retiring the
"client/server URL format must match" risk.

## Acceptance criteria

- [x] The URL builder and parser live in the protocol package; the web app uses the builder, the relay uses the parser.
- [x] A round-trip characterization test pins the exact URL format.
- [x] The extension's inline builder is asserted to produce a URL the shared parser accepts.
- [x] Clients connect exactly as before; all existing tests stay green.

## Blocked by

- 0036 — Stand up the protocol package (types + close codes)

> Note: this ticket and 0041 both touch the dev relay (URL parsing vs.
> restructuring). No hard dependency between them — coordinate merge order.