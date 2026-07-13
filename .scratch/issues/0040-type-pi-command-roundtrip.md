---
id: 0040
title: "Type the pi-command round-trip"
type: task
parent: 0035
blocked_by: [0036, 0037]
assigned: null
status: done
triage: ready-for-agent
---

# 0040 — Type the pi-command round-trip

## What to build

Replace the free-form string pi-command with a typed `PiCommand` discriminated
union (`model` / `skill` / `compact`) on the wire. Add the union and a
`parsePiCommand` helper to the protocol package (shape per spec 0035); the web
app builds typed commands — anything that doesn't parse to a known command is
sent as an ordinary user message — and the extension matches on `kind`, deleting
its string parser entirely. The relay is an oblivious forwarder (only
special-cases ping/pong) and is unchanged; this is a two-package coordinated
change. The ticket-0037 characterization passes against the new code. No
backwards-compatibility shim (skew accepted per spec 0035).

## Acceptance criteria

- [x] The `PiCommand` union and `parsePiCommand` helper live in the protocol package (shape per spec 0035).
- [x] The web app builds typed `PiCommand` values; the extension matches on `kind`; the on-wire `pi_command` payload is the typed union.
- [x] The extension's string command parser is deleted.
- [x] Ticket 0037's characterization passes against the new code (same pi-API actions for the same logical commands).
- [x] model / skill / compact flow end-to-end; the relay is unchanged.

## Blocked by

- 0036 — Stand up the protocol package (types + close codes)
- 0037 — Characterize the extension's command handling