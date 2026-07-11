---
id: 0009
title: "Standardize logging across all three packages"
type: task
parent: 0001
blocked_by: []
assigned: yinlootan
status: closed
---

## Question

Should pi-web-sync adopt one logging convention (prefix + levels) across the
extension, webapp, and relay — and remove the stray debug `console.log` left in
`App.tsx`?

## Resolution

**Prefix:** `[pi-web-sync]` adopted across all three packages — one grep prefix
for the whole tool, matching the convention 0007 established for the extension.
The relay's previous `[relay]` prefix and the webapp's `[useRelay]` / `[App]`
prefixes are gone; component identity survives in the message text (e.g.
`${clientType} connected`).

**Level discipline:**
- `warn` — actionable failures (config parse, sync_response, missing env URL)
- `debug` — chatty / expected noise (wire-message parse, per-message forwards,
  no-paired-client drops)
- `error` — genuine errors (relay socket error)
- `log` — retained only where justified: relay connect/disconnect (lifecycle
  visibility a self-hosting relay operator needs) and the startup banner

**Changes by package:**

| Package | Site | Before | After |
|---|---|---|---|
| webapp | `App.tsx` handleMessage | `console.log("[App]…")` | **removed** (stray debug noise) |
| webapp | `useRelay.ts` message parse | `error [useRelay]` | `debug [pi-web-sync]` (matches extension's wire-parse level) |
| relay | connected / disconnected | `log [relay]` | `log [pi-web-sync]` (justified lifecycle) |
| relay | forwarded N bytes | `log [relay]` | `debug [pi-web-sync]` (chatty per-message) |
| relay | no paired client | `log [relay]` | `debug [pi-web-sync]` (expected when peer absent) |
| relay | socket error | `error [relay]` | `error [pi-web-sync]` |
| relay | startup banner | `log` (no prefix) | `log [pi-web-sync]` |
| extension | (4 sites) | — | unchanged (already correct from 0007) |

**Finding (out of scope, noted):** the production Cloudflare DO (`relay/src/index.ts`)
has *zero* logging today — a self-hoster running the production relay has no
visibility into connect/disconnect/forward events, unlike the dev relay. Adding
DO logging is a separate concern (this ticket standardizes existing logging,
doesn't add sites). Candidate for the verification-pass fog to surface.

**Done when** checklist:
- ✅ One prefix (`[pi-web-sync]`) across all three packages
- ✅ Level discipline applied (warn/debug/error/log-justified)
- ✅ Stray `console.log` in `App.tsx` removed
- ✅ tsc clean, 17/17 extension+relay tests pass (4 pre-existing webapp jsdom failures unchanged)

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
