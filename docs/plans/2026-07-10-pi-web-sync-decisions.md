# Decisions: pi-web-sync

## Problem

We need a pi extension that syncs a local pi session with a web app deployed on Cloudflare. The goal is bidirectional real-time messaging: anything typed in the local pi session appears in the web app, and anything typed in the web app is sent back to pi. Each session gets a unique URL path. No server-side storage — the browser holds conversation history in localStorage. The pi extension should be published as an npm package.

Key constraints:
- Cloudflare deployment (Workers for relay, Pages for web app)
- No server-side storage (relay only forwards)
- Shared secret for access control (hashcode in URL path)
- Must display markdown tables properly in the web app
- Simple prototype first

## Approaches considered

- **Option A: WebSocket Relay on Cloudflare Worker** — Worker upgrades HTTP to WebSocket, pairs two clients (pi + web) per session ID, forwards JSON messages. Pro: Simple, symmetric, both peers get real-time updates. Con: Worker has 30s CPU limit (but WebSocket connections are long-lived, so this is fine).

- **Option B: WebRTC DataChannel with Worker as signaling** — Worker exchanges SDP offers/answers, data flows P2P. Pro: Lower latency, direct connection. Con: Complex NAT traversal, requires both peers online simultaneously, significantly more code for a prototype.

- **Option C: SSE + POST hybrid** — Web app uses SSE to receive, POSTs to send. Pi pushes via SSE, receives via POST. Pro: Simpler client. Con: Asymmetric, harder to reason about, SSE reconnects are fragile.

**Chosen:** Option A — WebSocket Relay. Simplest to implement, symmetric, works well for a prototype. WebRTC can be added later if latency becomes an issue.

## Decisions

### ADR-1: WebSocket relay over WebRTC

The relay is a Cloudflare Worker (~100 lines) that pairs two WebSocket clients per session ID and forwards JSON messages. No storage, no logic beyond routing. WebRTC would be more efficient but adds complexity (NAT traversal, signaling, connection state management) that isn't justified for a prototype.

### ADR-2: Session ID as shared secret

The URL path contains a session ID that also serves as the shared secret (e.g., `/session/a1b2c3d4`). Both pi and the web app must know this ID to connect. No separate auth layer — the ID itself is the credential. This is simple and sufficient for personal use.

### ADR-3: Pi extension publishes as npm package

The extension is published as an npm package containing only `packages/extension/` contents. Users install with `npm install pi-web-sync` and the extension auto-discovers. The monorepo is for development only — the relay and webapp are deployed separately to Cloudflare, not installed by users. The `files` field in package.json ensures only extension code is published.

### ADR-4: Markdown rendering with tables

The web app will use `react-markdown` with `remark-gfm` for GitHub-Flavored Markdown (tables, strikethrough, etc.). This handles the "display tables properly" requirement without custom rendering. Charts can be added later via mermaid.js if needed.

### ADR-5: Message format

Messages between pi and the relay use a simple JSON envelope:

```json
{
  "type": "user_message" | "assistant_delta" | "assistant_done" | "sync_request",
  "sessionId": "...",
  "payload": { ... }
}
```

- `user_message`: text from user (pi → web, web → pi)
- `assistant_delta`: streaming text chunk (pi → web)
- `assistant_done`: full assistant message (pi → web, for localStorage)
- `sync_request`: web app requests full history on connect (web → pi)

## Module outline

- `packages/extension/` — pi extension (npm package)
  - `index.ts` — extension entry: hooks into pi events, connects to relay WebSocket
  - `relay-client.ts` — WebSocket client for connecting to the Cloudflare Worker relay

- `packages/relay/` — Cloudflare Worker
  - `src/index.ts` — Worker entry: HTTP upgrade to WebSocket, session pairing, message forwarding
  - `wrangler.toml` — Cloudflare Worker config

- `packages/webapp/` — Cloudflare Pages app
  - `src/App.tsx` — main app: extracts session ID from URL, connects to relay
  - `src/components/Chat.tsx` — chat UI: message list, input, markdown rendering
  - `src/components/MessageBubble.tsx` — individual message with markdown rendering
  - `src/hooks/useRelay.ts` — WebSocket hook: connect, send, receive, reconnect
  - `src/hooks/useLocalStorage.ts` — persist conversation history