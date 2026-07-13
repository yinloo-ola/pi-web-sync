---
id: 0036
title: "Stand up the protocol package (types + close codes)"
type: task
parent: 0035
blocked_by: []
assigned: null
status: done
triage: done
---

# 0036 — Stand up the protocol package (types + close codes)

## What to build

Create the private workspace protocol package holding the wire types
(`RelayMessage`, the `MessageType` union, and the payload interfaces) and the
close-code constants (`CLOSE_DUPLICATE_WEB`, `CLOSE_INVALID_REQUEST`). Rewire all
three packages to import from it: the web app and relay as normal workspace
dependencies (each bundler inlines it), the extension as a **type-only dev
dependency** (types erased at runtime by jiti, so no build step and no runtime
dependency). The close code is defined once and consumed by both the relay and
the web app — the mirrored magic number is gone. This establishes the package and
validates the ADR-004 distribution decision end-to-end with the full type/code
contract.

## Acceptance criteria

- [ ] The protocol package exists as a private workspace package; the web app and relay depend on it normally, the extension as a type-only dev dependency.
- [ ] The wire types and close-code constants live in the protocol package; the web app's mirrored `4002` literal is replaced by an import of the shared constant.
- [ ] Cross-package typecheck passes; every existing test across all three packages stays green.
- [ ] The extension takes no runtime dependency on the package (types erased); ADR-003's no-build-step still holds.

## Blocked by

None — can start immediately. (Frontier ticket; the foundation for 0039, 0040, and 0041.)