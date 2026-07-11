---
id: 0009
title: "Standardize logging across all three packages"
type: task
parent: 0001
blocked_by: []
assigned: null
status: open
---

## Question

Should pi-web-sync adopt one logging convention (prefix + levels) across the
extension, webapp, and relay — and remove the stray debug `console.log` left in
`App.tsx`?

## Context

Ticket 0007 established a convention for the extension only: `[pi-web-sync]`
prefix, `console.warn` for actionable failures, `console.debug` for expected
noise. The other two packages did not follow suit:

- **webapp** — three different prefixes (`[useRelay]`, `[App]`, `[pi-web-sync]`),
  no level discipline (warn/log/error mixed), and a stray
  `console.log("[App] handleMessage:", msg.type)` in `App.tsx:40` that fires on
  every received message — debug noise that shouldn't ship.
- **relay** — `[relay]` prefix (consistent), but `console.log`/`console.error`
  only; no `debug` level for the chatty connect/disconnect lines.

A self-hoster debugging a flaky relay reads these logs; inconsistent prefixes
and a noisy debug line make that harder than it should be.

## Done when

- One prefix adopted across all three packages (recommend `[pi-web-sync]` to
  match the extension's existing convention — confirm during resolution).
- Level discipline applied: `warn` for actionable failures, `debug` for
  chatty/expected noise (relay connect/disconnect, wire-message parse), `error`
  for genuine errors, `log` removed or justified.
- Stray `console.log("[App] handleMessage:", msg.type)` in `App.tsx` removed (or
  downgraded to `debug` if it has a debugging use — decide and record).
- No behavior change for happy paths; builds and tests pass across all three
  packages.