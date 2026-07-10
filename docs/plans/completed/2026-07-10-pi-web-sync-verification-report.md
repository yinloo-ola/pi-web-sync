# Verification Report: pi-web-sync

**Date:** 2026-07-10
**Scope:** All 4 packages (relay Worker, extension, web app) — 13 stubs filled across 8 files

## Summary

| Pass | Critical | High | Medium | Low |
|------|----------|------|--------|-----|
| 🔴 Security | 0 | 0 | 1 | 2 |
| 🟡 Optimization | — | 1 | 0 | 2 |
| 🔵 Traceability | 2 | 0 | 0 | 2 |
| **Total** | **2** | **1** | **1** | **6** |

## 🔴 Security Findings

### [S-001] Medium — No rate limiting on relay WebSocket connections
**Location:** `packages/relay/src/index.ts:17`
**Issue:** The relay Worker's Map of sessions is unbounded. An attacker who knows (or guesses) session IDs could open unlimited WebSocket connections, consuming Cloudflare Worker resources. No connection-per-IP or per-session limit is enforced.
**Fix:** Add per-IP connection limits via `request.cf?.country` or store connection counts per session ID and refuse new pairings beyond a threshold (e.g., 2 per session). Acceptable to defer for prototype.

### [S-002] Low — Env var defaults point to fake domains
**Location:** `packages/extension/index.ts:5-6`, `packages/webapp/src/App.tsx:8`
**Issue:** `PI_WEB_SYNC_RELAY_URL`, `PI_WEB_SYNC_WEBAPP_URL`, and `DEFAULT_RELAY_URL` all default to `example.com` domains. If deployed without setting these env vars, connection failures are silent — the WebSocket simply never opens, and the user sees "Disconnected" with no actionable error message.
**Fix:** Log a warning on startup if env vars are unset: `console.warn("PI_WEB_SYNC_RELAY_URL not set — using default")`. Or make them required (throw on missing).

### [S-003] Low — React-markdown could render user-controlled links
**Location:** `packages/webapp/src/components/MessageBubble.tsx:19`
**Issue:** `react-markdown` renders markdown links (`[text](url)`) as clickable `<a>` tags. A user could send a message containing a malicious link that another user might click. This is a phishing concern, not XSS (react-markdown escapes HTML by default).
**Fix:** Optional — add `allowedElements` or `unwrapDisallowed` to restrict which markdown elements render. Low priority for personal use.

## 🟡 Optimization Findings

### [O-001] P1 — Duplicated `RelayMessage` type across two packages
**Location:** `packages/extension/types.ts:8-10` and `packages/webapp/src/types.ts:10-12`
**Issue:** The `RelayMessage` interface is defined identically in both packages. If the message format evolves (new fields, changed types), one copy will drift from the other. This is the cost of a monorepo without a shared types package.
**Fix:** Extract shared types into `packages/shared/types.ts` and import from both packages. Or for the prototype, add a comment warning to keep them in sync.

### [O-002] P2 — `clearMessages` and `reconnect` are exported but unused
**Location:** `packages/webapp/src/hooks/useLocalStorage.ts:10` (clearMessages), `packages/webapp/src/hooks/useRelay.ts:16` (reconnect)
**Issue:** Both hooks export functions that are never called in `App.tsx`. `clearMessages` persists an empty array to localStorage; `reconnect` triggers a new WebSocket connection. Both have valid use cases (clear chat, reconnect after disconnect) but are currently dead code.
**Fix:** Remove them for now and re-add when needed, or wire reconnect into the UI as a "Reconnect" button in the Chat header when `connectionState === "disconnected"`.

### [O-003] P2 — `sessionId` prop declared but unused in Chat component
**Location:** `packages/webapp/src/components/Chat.tsx:8`
**Issue:** The `ChatProps` interface includes `sessionId: string`, but the component destructures only `{ messages, onSendMessage, connectionState }`. The prop is silently passed and ignored.
**Fix:** Remove `sessionId` from `ChatProps` and from the JSX in `App.tsx` (line 76).

## 🔵 Traceability Findings

### [T-001] Critical — URL format mismatch between relay clients and relay Worker
**Entry point:** `packages/extension/relay-client.ts:18` and `packages/webapp/src/hooks/useRelay.ts:41`
**Call chain:** client (`WebSocket(url)`) → relay Worker (`fetch` handler → path regex)
**Broken at:** URL construction boundary

**Issue:** Both clients construct WebSocket URLs that don't match the relay's path format.

| Component | URL constructed | Relay expects |
|-----------|----------------|---------------|
| Extension `RelayClient.connect()` | `wss://relay.example.com?sessionId=abc12345` | `wss://relay.example.com/session/abc12345?client=pi` |
| Web app `useRelay` | `wss://relay.example.com?sessionId=abc12345&client=web` | `wss://relay.example.com/session/abc12345?client=web` |

The relay's fetch handler matches path `/^\/session\/([a-f0-9]+)$/` — no session ID in the query string will match. Both connections will hit the 404 path, never establish a WebSocket, and silently fail.

**Fix:** Update both clients to use the `/session/<id>?client=<type>` format:
- Extension `relay-client.ts` line 18: `` `${this.url}/session/${this.sessionId}?client=pi` ``
- Web app `useRelay.ts` line 41-44: switch to string interpolation to match the relay path format, or update the relay to accept query-param-style session IDs.

### [T-002] Critical — Sync request never sent from web app
**Entry point:** `packages/webapp/src/hooks/useRelay.ts:37-50` (connect function)
**Call chain:** web app connects → should send `sync_request` → extension handles → returns history
**Broken at:** Missing step — web app never sends the initial `sync_request` message

**Issue:** When the web app's WebSocket connects, it sets up event listeners but never sends a `sync_request` message. The extension's `onSyncRequest` handler (at `packages/extension/index.ts:53-78`) is dead code — it will never execute.

The net effect: when a user opens the web app URL, they see an empty chat even if the pi session already has history. The full conversation is never synced to the browser.

**Fix:** In `useRelay.ts`, add a `ws.addEventListener("open", ...)` that sends the sync request:
```ts
ws.addEventListener("open", () => {
  ws.send(JSON.stringify({
    type: "sync_request",
    sessionId,
    payload: {},
  }));
});
```

### [T-003] Low — `sessionId` parameter unused in `setupForwarding`
**Location:** `packages/relay/src/index.ts:65`
**Issue:** The `setupForwarding` function receives `sessionId` as a parameter but never uses it (the function only needs `ws`, `clientType`, and `pair` to forward messages).
**Fix:** Remove the `sessionId` parameter from the function signature and its call site (line 49).

## Remediation Task List

| ID | Priority | Finding | Effort | Skill |
|----|----------|---------|--------|-------|
| T-001 | Critical | URL format mismatch between clients and relay | small | ptk-modify |
| T-002 | Critical | Sync request never sent from web app | small | ptk-modify |
| O-001 | P1 | Duplicated RelayMessage type across packages | small | ptk-modify |
| O-003 | P2 | sessionId prop unused in Chat component | trivial | ptk-modify |
| S-001 | Medium | No rate limiting on relay connections | medium | ptk-modify |
| T-003 | Low | sessionId parameter unused in setupForwarding | trivial | ptk-modify |
| O-002 | P2 | clearMessages and reconnect are unused | trivial | ptk-modify |
| S-002 | Low | Env var defaults point to fake domains | small | ptk-modify |
| S-003 | Low | React-markdown renders user-controlled links | trivial | ptk-modify |