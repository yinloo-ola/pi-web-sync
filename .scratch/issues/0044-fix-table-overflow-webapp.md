---
id: 0044
title: "Fix markdown table overflow in webapp message bubbles"
type: task
parent: 0043
blocked_by: []
assigned: agent
status: closed
triage: ready-for-agent
---

# 0044 — Fix markdown table overflow in webapp message bubbles

## Question

How do we keep wide markdown tables (and code blocks / images) from breaking out of message bubbles on small screens?

## Resolution

- Added overflow-safe CSS rules to `.message-bubble` and its markdown children in `packages/webapp/src/responsive.css`: `overflow-wrap: break-word`, tables scroll horizontally (`display: block; overflow-x: auto`), `<pre>` blocks scroll horizontally, and images scale to `max-width: 100%`.
- Added inline backstop styles on `MessageBubble.tsx` for `overflowWrap: "break-word"` and `maxWidth: "100%"`.
- Added `packages/webapp/src/components/MessageBubble.test.tsx` covering user/assistant rendering, bubble styles, and markdown table/image/code-block rendering.
- Also fixed a pre-existing jsdom crash in `SlashMenu.tsx` by adding optional chaining to `scrollIntoView` calls, so the full webapp test suite runs cleanly (43/43 tests pass).

## Problem

`ReactMarkdown` with `remarkGfm` can render tables and `<pre>` blocks that are wider than the message bubble. Because the bubble currently has no `overflow` handling, the table forces the whole chat width to grow, especially on mobile, making the page horizontally scrollable.

## Solution

Add CSS overflow controls to `.message-bubble` and its generated markdown children.

### Files to change

- `packages/webapp/src/responsive.css`
- `packages/webapp/src/components/MessageBubble.tsx` (minor inline style)
- `packages/webapp/src/components/MessageBubble.test.tsx` (new test)

### CSS rules

```css
/* Bubble itself should wrap long words */
.message-bubble {
  overflow-wrap: break-word;
  word-wrap: break-word;
  max-width: 100%;
}

/* Tables scroll horizontally instead of overflowing */
.message-bubble table {
  display: block;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
}

.message-bubble th,
.message-bubble td {
  padding: 6px 8px;
  border: 1px solid #C7C7CC;
}

/* Code blocks scroll horizontally */
.message-bubble pre {
  overflow-x: auto;
  max-width: 100%;
  padding: 10px;
  background-color: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
}

/* Images never overflow */
.message-bubble img {
  max-width: 100%;
  height: auto;
}
```

### Inline style change

In `MessageBubble.tsx`, keep the existing bubble styles and add:

```tsx
style={{
  // ...existing styles
  overflowWrap: "break-word",
  maxWidth: "100%",
}}
```

### Testing

- Render a `MessageBubble` containing a GFM table with several long columns.
- Assert that the rendered table is inside an element with `overflowX: "auto"` (e.g., via the CSS class matching `display: block; overflow-x: auto`).
- Render a wide image and assert its computed `max-width` is `100%`.
- Run the webapp tests and ensure no regressions in `MessageBubble` rendering.

## Out of scope

- Changing bubble colors, fonts, or border radius.
- Converting tables to cards or other layouts.
- Handling超长 unbroken code lines differently from a simple horizontal scroll.