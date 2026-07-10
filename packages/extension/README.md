# pi-web-sync

Sync your [pi](https://github.com/earendil-works/pi-coding-agent) coding sessions to a live web app in real time.

## Install

```bash
npm install pi-web-sync
```

## Setup

Configure the relay and web app URLs via environment variables:

```bash
export PI_WEB_SYNC_RELAY_URL=wss://relay.pi-web-sync.example.com
export PI_WEB_SYNC_WEBAPP_URL=https://web.pi-web-sync.example.com
```

The extension auto-discovers when pi loads. Start a pi session and open the printed URL in your browser.

## How it works

- Each pi session generates a unique session ID
- The extension streams your conversation to a WebSocket relay
- Open the session URL in any browser to mirror your chat
- Type in the browser and it reaches pi

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PI_WEB_SYNC_RELAY_URL` | `ws://localhost:8787` | WebSocket relay URL |
| `PI_WEB_SYNC_WEBAPP_URL` | `http://localhost:5173` | Web app base URL |

## Self-hosting

See the [main repository](https://github.com/yinloo-ola/pi-web-sync) for instructions on self-hosting the relay and web app.

## License

MIT