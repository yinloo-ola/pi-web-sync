---
id: 0018
title: "Self-hosting deployment docs"
type: task
parent: 0014
blocked_by: [0016, 0017]
assigned: yinlootan
status: closed
---

## Question

Write a self-hosting guide that covers deployment, configuration, and how the
share link works.

## Resolution

Updated README.md:
- Web app production section now says "No build-time configuration needed"
  instead of referencing `VITE_RELAY_URL`.
- Added step-by-step guide under "Configure the extension": deploy relay,
  deploy webapp, create config file, verify.
- Explains that the relay URL travels with each share link via `?relay=` param.