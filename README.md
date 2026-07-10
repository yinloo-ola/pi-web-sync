# pi-web-sync

Sync your [pi](https://github.com/earendil-works/pi-coding-agent) coding sessions to a live web app in real time.

<pre align="center">
  pi session  ──►  WebSocket Relay  ──►  Web App
       ◄──────────────────────────────────────
</pre>

---

## Quick Start

```bash
# 1. Install the extension
npm install pi-web-sync

# 2. Start the relay (local dev)
npx tsx node_modules/pi-web-sync-relay/src/relay-server.ts

# 3. Open the web app
#     → http://localhost:5173/session/<session-id>
#     (pi prints the URL on session start)
```

That's it. Type in pi → see it in the browser. Type in the browser → it reaches pi.

---

## Architecture

```
┌─────────────┐     WebSocket      ┌──────────────────┐     WebSocket      ┌───────────┐
│  pi session  │ ◄──────────────► │  WebSocket Relay  │ ◄──────────────► │  Web App  │
│  (extension) │     JSON msgs    │  (Worker/Durable  │     JSON msgs    │  (React)  │
└─────────────┘                    └──────────────────┘                   └───────────┘
```

| Component | Package | Role |
|---|---|---|
| **Extension** | `packages/extension` | Pi plugin — hooks into pi events (session_start, input, message_update, message_end) and relays messages via WebSocket |
| **Relay** | `packages/relay` | Cloudflare Worker — pairs one pi client with one web client per session ID, forwards JSON messages between them. No storage. |
| **Web App** | `packages/webapp` | React + Vite SPA — displays conversation with markdown rendering. History persisted in localStorage. |

### Message flow

1. Pi session starts → extension generates a random session ID, connects to the relay
2. Pi prints the session URL — open it in a browser
3. Each keystroke in pi streams to the web app as `assistant_delta` messages
4. Complete messages arrive as `assistant_done` — stored in localStorage
5. Messages typed in the web app reach pi as `user_message` messages
6. On reconnect, the web app requests full history via `sync_request`; pi replies with `sync_response`

---

## Setup

### Extension

```bash
npm install pi-web-sync
```

The extension auto-discovers when pi loads. Configure via environment variables:

```bash
# Optional — defaults shown
PI_WEB_SYNC_RELAY_URL=ws://localhost:8787
PI_WEB_SYNC_WEBAPP_URL=http://localhost:5173
```

### Relay

**Local development:**

```bash
cd packages/relay
npm run dev
# Starts relay server at ws://localhost:8787
```

**Production (Cloudflare Workers):**

```bash
cd packages/relay
npx wrangler deploy
```

> **Note:** Production deployment requires [Durable Objects](https://developers.cloudflare.com/durable-objects/) to maintain WebSocket state across Worker requests. See the relay source for details.

### Web App

**Local development:**

```bash
cd packages/webapp
npm run dev
# Starts at http://localhost:5173
```

**Production (Cloudflare Pages):**

```bash
cd packages/webapp
npm run build
npx wrangler pages deploy dist
```

Set `VITE_RELAY_URL` to your deployed relay URL.

---

## Configuration

### Environment variables

| Variable | Default | Package | Description |
|---|---|---|---|
| `PI_WEB_SYNC_RELAY_URL` | `ws://localhost:8787` | extension | WebSocket relay URL |
| `PI_WEB_SYNC_WEBAPP_URL` | `http://localhost:5173` | extension | Web app base URL (for session URL display) |
| `VITE_RELAY_URL` | `wss://pi-web-sync-relay.example.com` | webapp | WebSocket relay URL (Vite env) |

### Session ID

Each session gets a random 8-hex-character ID that doubles as a shared secret. The URL path is `/session/<id>`. Both pi and the web app must know this ID to connect — there is no separate auth layer.

---

## Development

This is an npm workspaces monorepo:

```
pi-web-sync/
├── packages/
│   ├── extension/   ← Pi extension (npm package)
│   ├── relay/       ← Cloudflare Worker
│   └── webapp/      ← React + Vite app
├── docs/
│   └── plans/       ← Design docs, ADRs, verification reports
└── package.json     ← Workspace root
```

### Scripts

```bash
npm install              # Install all workspace dependencies
npm run dev --workspace=packages/relay    # Start relay locally
npm run dev --workspace=packages/webapp   # Start web app locally
```

### Testing

```bash
# Extension tests
cd packages/extension && npx vitest

# Relay tests
cd packages/relay && npx vitest
```

---

## Deployment

### Recommended setup

| Component | Platform | Notes |
|---|---|---|
| Relay | Cloudflare Workers + Durable Objects | The Worker pairs WebSocket clients; Durable Objects maintain state across requests |
| Web App | Cloudflare Pages | Static SPA; set `VITE_RELAY_URL` env var in Pages dashboard |
| Extension | npm package | Published separately; users install with `npm install pi-web-sync` |

### CI/CD

The relay and webapp can be deployed independently via GitHub Actions or similar. The extension is published to npm separately.

---

## License

[MIT](LICENSE)