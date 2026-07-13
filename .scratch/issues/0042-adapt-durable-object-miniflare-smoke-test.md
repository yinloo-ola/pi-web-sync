---
id: 0042
title: "Adapt the Durable Object + add the Miniflare smoke test"
type: task
parent: 0035
blocked_by: [0041]
assigned: null
status: done
triage: ready-for-agent
---

# 0042 — Adapt the Durable Object + add the Miniflare smoke test

## What to build

Convert the production Durable Object into a thin adapter that runs the shared
`RelaySession` — same policy as the dev relay, including the same-type-replace
notify. Add a Miniflare smoke test (via the Cloudflare vitest workers pool) that
drives a real pi↔web forwarding exchange plus the single-tab reject through the
production Durable Object. This closes the audit's "production Durable Object has
zero CI tests" gap: after 0041 the policy can't drift between transports, and
this test guards the only remaining DO-specific code — the adapter glue.

## Acceptance criteria

- [x] The Durable Object is a thin adapter over `RelaySession`; no DO-specific policy code remains.
- [x] The DO adopts the same policy as the dev relay, including the same-type-replace notify.
- [x] A Miniflare smoke test exercises a pi↔web forwarding exchange through the real Durable Object and asserts the web leg receives the message.
- [x] The smoke test asserts the single-tab reject (`CLOSE_DUPLICATE_WEB`) via the DO.

## Blocked by

- 0041 — Extract RelaySession behind the RelaySocket seam