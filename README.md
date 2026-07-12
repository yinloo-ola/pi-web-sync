# pi-web-sync

Sync your [pi](https://github.com/earendil-works/pi-coding-agent) coding sessions to a live web app in real time.

<pre align="center">
  pi session  ──►  WebSocket Relay  ──►  Web App
       ◄──────────────────────────────────────
</pre>

---

## Quick start

This project has three components: a pi extension, a WebSocket relay, and a web app. You self-host the relay and web app, and configure the extension to point at them.

```bash
pi install pi-web-sync
```

Configure the extension (pick one):

<details>
<summary><b>📄 Config file</b> (recommended — set once, works for every session)</summary>

Create a JSON file at one of these locations:

| Location | Scope | Path |
|---|---|---|
| **Global** (all projects) | User-wide | <code>~/.pi-web-sync.json</code> |
| **Project** (per-project) | Local override | <code>.pi-web-sync.json</code> |

Required fields:

```json
{
  "relayUrl": "ws://localhost:8787",
  "webappUrl": "http://localhost:5173"
}
```

| Field | Description |
|---|---|
| `relayUrl` | WebSocket relay URL (required) |
| `webappUrl` | Web app base URL for session links (required) |
</details>

<details>
<summary><b>🔧 Environment variables</b></summary>

```bash
export PI_WEB_SYNC_RELAY_URL=ws://localhost:8787
export PI_WEB_SYNC_WEBAPP_URL=http://localhost:5173
```
</details>

<details>
<summary><b>⌨️ Interactive command</b></summary>

In pi, run:

```
/web-sync connect ws://localhost:8787 http://localhost:5173
```
</details>

> **No default servers are provided.** You must deploy your own relay and web app, or run them locally. See below.

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
| **Extension** | `packages/extension` | Pi plugin — hooks into pi events and relays messages via WebSocket |
| **Relay** | `packages/relay` | Cloudflare Worker — pairs one pi client with one web client per session ID, forwards JSON messages. No storage. |
| **Web App** | `packages/webapp` | React + Vite SPA — displays conversation with markdown rendering. History persisted in localStorage. |

### Message flow

1. Pi session starts → extension generates a session ID, connects to the relay
2. Pi prints the session URL — open it in a browser
3. Keystrokes in pi stream to the web app as `assistant_delta` messages
4. Complete messages arrive as `assistant_done` — stored in localStorage
5. Messages typed in the web app reach pi as `user_message` messages
6. On reconnect, the web app requests full history via `sync_request`; pi replies with `sync_response`

---

## Self-host

### Relay

**Local development:**

```bash
cd packages/relay
npm run dev
# Starts at ws://localhost:8787
```

**Production (Cloudflare Workers + Durable Objects):**

```bash
cd packages/relay
npx wrangler deploy
```

> Durable Objects are required for production — they maintain WebSocket state across Worker requests. Requires a [Workers Paid plan](https://developers.cloudflare.com/workers/platform/pricing/) ($5+/mo).

> **Observability:** `npx wrangler tail` streams relay logs (connect/disconnect, forwarding at debug, errors) with the `[pi-web-sync]` prefix — useful when debugging connection issues on a deployed relay.

### Web app

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

No build-time configuration needed — the relay URL travels with each share link as a `?relay=` query parameter.

### Configure the extension

```bash
pi install pi-web-sync
```

**Step-by-step:**

1. Deploy the relay — `cd packages/relay && npx wrangler deploy`
2. Deploy the web app — `cd packages/webapp && npm run build && npx wrangler pages deploy dist`
3. Create `~/.pi-web-sync.json` with your deployed URLs:
   ```json
   {
     "relayUrl": "wss://your-relay.workers.dev",
     "webappUrl": "https://your-webapp.pages.dev"
   }
   ```
4. Start a pi session, run `/web-sync`, and open the URL in a browser.

**Config file** (recommended): create a JSON file at one of these locations:

| Location | Scope | Path |
|---|---|---|
| **Global** (all projects) | User-wide | `~/.pi-web-sync.json` |
| **Project** (per-project) | Local override | `.pi-web-sync.json` |

Required fields:

```json
{
  "relayUrl": "ws://localhost:8787",
  "webappUrl": "http://localhost:5173"
}
```

| Field | Description |
|---|---|
| `relayUrl` | WebSocket relay URL (required) |
| `webappUrl` | Web app base URL for session links (required) |

**Environment variables:**

| Variable | Description |
|---|---|
| `PI_WEB_SYNC_RELAY_URL` | WebSocket relay URL |
| `PI_WEB_SYNC_WEBAPP_URL` | Web app base URL (for session URL display) |

**Interactive:** `/web-sync connect <relay-url> <webapp-url>`

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
npm install                                    # Install all workspace dependencies
npm run dev --workspace=packages/relay         # Start relay locally
npm run dev --workspace=packages/webapp        # Start web app locally
```

### Testing

```bash
cd packages/extension && npx vitest    # Extension tests
cd packages/relay && npx vitest        # Relay tests
```

---

## License

[MIT](LICENSE)
