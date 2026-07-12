---
id: 0017
title: "Webapp reads relay URL from URL params at runtime"
type: task
parent: 0014
blocked_by: []
assigned: yinlootan
status: closed
---

## Question

Modify `packages/webapp/src/App.tsx` to read the relay URL from `?relay=` in
the URL at runtime, instead of `import.meta.env.VITE_RELAY_URL`.

## Resolution

`App.tsx` now reads `new URLSearchParams(window.location.search).get("relay")`
at module level. `VITE_RELAY_URL` removed entirely. When `?relay=` is missing,
the app renders "No relay configured. Open a share link from pi." (per
decision 0015). The `useRelay` hook was unchanged — it already accepts
`relayUrl` as a parameter. Webapp tests pass (10/10).