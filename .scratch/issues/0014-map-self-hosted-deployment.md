---
id: 0014
title: "Self-hosted Cloudflare deployment"
type: map
parent: null
blocked_by: []
assigned: null
status: closed
---

# Self-hosted Cloudflare deployment

## Destination

Anyone can deploy their own relay (Cloudflare Workers) and webapp (Cloudflare
Pages) and the system just works — no build-time configuration, no hardcoded
URLs. The extension reads relay + webapp URLs from `~/.pi-web-sync.json`, and
the webapp discovers its relay URL at runtime via a query parameter.

## Notes

- **Domain:** pi-web-sync — a pi extension + WebSocket relay (CF Worker /
  Durable Object) + React web app.
- **Three packages:** `packages/extension` (pi plugin, Node), `packages/relay`
  (CF Worker + DO), `packages/webapp` (React + Vite, deployed to CF Pages).
- **Skills:** `/grilling`, `/domain-modeling` for decisions; `/tdd` and
  `/implement` for execution.
- **Standing preferences:**
  - Tests live in each package (`npx vitest`).
  - `RelayMessage` types must not drift across packages.
  - `npm run deploy` from root deploys both relay and webapp.
- **Tracker:** local markdown under `.scratch/issues/` — see
  `docs/agents/issue-tracker.md`.
- **Execution in the map:** this effort's tickets are TASK type — the
  destination is a change made in place.

## Decisions so far

- [Fallback strategy when ?relay= param is missing](0015-fallback-strategy-when-relay-param-missing.md) — show an error, no fallback. `VITE_RELAY_URL` can be removed entirely.
- [Extension passes relay URL in share link](0016-extension-passes-relay-url-in-share-link.md) — `getSessionUrl()` now includes `?relay=` via `searchParams.set`. All call sites updated, tests pass.
- [Webapp reads relay URL from URL params](0017-webapp-reads-relay-url-from-url-params.md) — `App.tsx` reads `?relay=` via `URLSearchParams`. `VITE_RELAY_URL` removed. Missing param shows error. Tests pass.
- [Self-hosting deployment docs](0018-self-hosting-deployment-docs.md) — README updated: removed `VITE_RELAY_URL` reference, added step-by-step self-hosting guide.

## Not yet specified

<!-- fog: in-scope decisions not yet sharp enough to ticket -->

**Destination reached.** All tickets resolved:
- Share links carry `?relay=` (extension change)
- Webapp reads relay URL at runtime (no build-time config)
- Missing `?relay=` shows clear error
- Self-hosting docs updated

No fog remains; the map is closed.

## Out of scope

<!-- work consciously ruled out of this effort -->

- **Managed/shared deployment.** This effort is about self-hosting only; the
  original `localhost:8787` dev flow is not changed.
- **Authentication / API keys on the relay.** Session-ID-as-secret is
  sufficient; auth is a separate effort.