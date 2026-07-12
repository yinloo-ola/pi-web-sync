---
id: 0016
title: "Extension passes relay URL in share link"
type: task
parent: 0014
blocked_by: []
assigned: yinlootan
status: closed
---

## Question

Modify `getSessionUrl()` in `packages/extension/index.ts` to include the relay
URL as a query parameter.

## Resolution

`getSessionUrl()` now takes a third parameter `relayUrl` and uses
`new URL()` + `searchParams.set("relay", relayUrl)` to build the URL.
All three call sites updated: `connectRelay()`, `/web-sync qr`, and
`/web-sync status`. Extension tests pass (10/10).