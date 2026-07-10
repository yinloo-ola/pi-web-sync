# pi-web-sync

Sync your [pi](https://github.com/earendil-works/pi-coding-agent) coding sessions to a live web app in real time.

## Install

```bash
npm install pi-web-sync
```

## Configuration

### Option 1: Config file (recommended)

Create `~/.pi-web-sync.json` (global) or `.pi-web-sync.json` in your project root:

```json
{
  "relayUrl": "ws://localhost:8787",
  "webappUrl": "http://localhost:5173"
}
```

Set once, works for every pi session.

### Option 2: Environment variables

```bash
export PI_WEB_SYNC_RELAY_URL=ws://localhost:8787
export PI_WEB_SYNC_WEBAPP_URL=http://localhost:5173
```

### Option 3: Interactive command

In pi, use the `/web-sync` command:

```
/web-sync connect ws://localhost:8787 http://localhost:5173
```

You must provide your own relay and web app. See the [main repository](https://github.com/yinloo-ola/pi-web-sync) for self-hosting instructions.

## How it works

- Each pi session generates a unique session ID
- The extension streams your conversation to a WebSocket relay
- Open the session URL in any browser to mirror your chat
- Type in the browser and it reaches pi

## License

MIT