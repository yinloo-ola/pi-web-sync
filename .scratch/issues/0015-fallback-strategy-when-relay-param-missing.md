---
id: 0015
title: "Fallback strategy when ?relay= param is missing"
type: grilling
parent: 0014
blocked_by: []
assigned: yinlootan
status: closed
---

## Question

When the webapp loads without `?relay=` in the URL (e.g. someone navigates
directly to the webapp root, or an old share link without the param), what
should happen?

## Resolution

**Option A: show an error.** No fallback to `VITE_RELAY_URL` or
`window.location.origin`. The webapp shows "No relay configured. Open a
share link from pi." and does not attempt a connection.

Rationale: the old flow (deploy webapp with hardcoded relay URL) is being
replaced by the new flow (relay URL travels with the share link). Keeping
`VITE_RELAY_URL` as a fallback creates two paths to maintain. A clear error
is better than a silent wrong connection.

`VITE_RELAY_URL` can be removed from the webapp entirely after this change.