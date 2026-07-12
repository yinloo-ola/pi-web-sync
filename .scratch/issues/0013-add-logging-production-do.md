---
id: 0013
title: "Add logging to the production Durable Object relay"
type: task
parent: 0001
blocked_by: []
assigned: null
status: open
---

## Question

The production Cloudflare Durable Object relay (`packages/relay/src/index.ts`)
has zero logging, unlike the dev relay. Add logging sufficient for a self-hoster
deploying the Worker to debug connection/disconnection and forwarding — in
whatever form works on Cloudflare (`console.log` surfaces in `wrangler tail`).

## Context

Surfaced by the verification pass
([report](../../docs/plans/verification-pass-0010.md), criterion 5) and noted in
ticket 0009's resolution.

- `grep -n "console\." packages/relay/src/index.ts` → **zero** logging
  statements. The dev relay (`relay-server.ts`) has 6 (listen-ready, per-client
  connect/disconnect with session ID + close code + active session count,
  forwarded byte counts at debug, errors).
- The README documents the Worker/DO as the production path ("Durable Objects
  are required for production"), so a self-hoster who deploys production gets a
  black box — no visibility via `wrangler tail`.
- The verification pass used the dev relay, so the DO path was not
  runtime-exercised; the zero-logging finding is code-confirmed. If adding
  logging, also exercise the DO locally (`wrangler dev`) to confirm the logs
  appear.
- **Runtime-confirmed (pass 0010b):** ran the production DO under `wrangler dev`
  and exercised every transport criterion (see
  [verification-do-0010b](../../docs/plans/verification-do-0010b.md)). `wrangler
  tail` showed only HTTP-level fetch logs (`GET /session/... 101`) and **zero**
  application output from the DO — confirming the black-box finding live, not
  just by code reading. (Pass 0010b also confirmed the DO is transport-parity
  with the dev relay on all other criteria — no DO-specific bug.)

**Scope note:** this is the production-DO observability gap that graduated from
the map's "Not yet specified" fog. It is the one ticket from the observability
criterion; the dev relay is already sufficiently logged, and the
extension/webapp surface connection state through their UIs (not graduated).

## Done when

- The DO logs connect/disconnect (with session id + close code), forwarding
  activity (debug), and errors — mirroring the dev relay's discipline where
  sensible, with the `[pi-web-sync]` prefix and level conventions from ticket
  0009.
- Verified via `wrangler dev` that the logs appear in `wrangler tail`.
- A note added to the README's self-host section that `wrangler tail` gives relay
  visibility.