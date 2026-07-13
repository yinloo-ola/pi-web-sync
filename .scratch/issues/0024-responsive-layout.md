---
id: 0024
title: "Responsive layout for mobile and desktop"
type: task
parent: 0019
blocked_by: []
assigned: null
status: closed
triage: ready-for-agent
---

# 0024 — Responsive layout for mobile and desktop

**What to build:** The chat fills the screen on mobile with thumb-friendly input, appropriate padding, and wrapping header indicators. Desktop experience is preserved with max-width 720px.

**Blocked by:** None — can start immediately.

**Status:** done

## Resolution

Added `responsive.css` with media queries for mobile-first responsive layout. Chat container uses `max-width: 100%` (mobile) → `720px` (desktop). Header has `flex-wrap` for status indicators. Message list padding adjusts per viewport. Input area has larger touch targets (44px min-height) and `font-size: 16px` to prevent iOS zoom. Message bubbles use `85%` max-width (mobile) → `80%` (desktop). CSS imported in `main.tsx`. All 14 tests pass.

- [x] Replace fixed `maxWidth: 720` with fluid layout: `maxWidth: 100%` default, `@media (min-width: 768px) { maxWidth: 720px }` for desktop
- [x] Adjust Chat padding: `16px 20px` on desktop, `12px 16px` on mobile
- [x] Make input area thumb-friendly: full-width input with larger touch targets on mobile
- [x] Add flex-wrap to header status indicators so they don't overflow on small screens
- [x] Adjust MessageBubble max-width: `85%` on mobile, `80%` on desktop
- [x] Verify the "No messages yet" empty state is centered and readable on both screen sizes
- [x] Verify the reconnect banner is visible and actionable on mobile
- [x] Manual testing on mobile viewport (Chrome DevTools device emulation or real device)