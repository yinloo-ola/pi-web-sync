# pi-web-sync

Sync your [pi](https://github.com/earendil-works/pi-coding-agent) coding sessions to a live web app in real time.

<pre align="center">
  pi session  ──►  WebSocket Relay  ──►  Web App
       ◄──────────────────────────────────────
</pre>

---

## For Users

Install the extension and connect to the default relay and web app hosted by the project maintainers.

### Quick start

```bash
# 1. Install the extension
npm install pi-web-sync

# 2. Configure environment variables for your pi session
#    (add these to your shell profile or pi config)
export PI_WEB_SYNC_RELAY_URL=wss://relay.pi-web-sync.example.com
export PI_WEB_SYNC_WEBAPP_URL=https://web.pi-web-sync.example.com
```

That's it. Start a pi session and the extension automatically generates a session URL. Open it in your browser to see your chat in real time.

### How it works

Once the extension is installed:
1. Each pi session generates a unique session ID
2. The extension connects to the shared relay and streams your conversation
3. Open the printed URL in any browser — the web app mirrors your chat
4. Type in the browser and it reaches pi

No servers to run, no configuration beyond the two environment variables above.

---

## For Developers

Self-host the relay and web app, or contribute to the codebase.

### Architecture

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

### Self-host the relay

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

> Durable Objects are required for production — they maintain WebSocket state across Worker requests. See the relay source for details.

### Self-host the web app

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

### Configure the extension for your own servers

| Variable | Default | Description |
|---|---|---|
| `PI_WEB_SYNC_RELAY_URL` | `ws://localhost:8787` | WebSocket relay URL |
| `PI_WEB_SYNC_WEBAPP_URL` | `http://localhost:5173` | Web app base URL (for session URL display) |

Set these in your pi session environment to point the extension at your self-hosted relay and web app.

### Monorepo structure

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

### Deployment

| Component | Platform | Notes |
|---|---|---|
| Relay | Cloudflare Workers + Durable Objects | Pairs WebSocket clients; Durable Objects maintain state |
| Web App | Cloudflare Pages | Static SPA; set `VITE_RELAY_URL` in Pages dashboard |
| Extension | npm package | Published separately; `npm install pi-web-sync` |

---

## License

[MIT](LICENSE)