# pi-web-sync

Sync your [pi](https://github.com/earendil-works/pi-coding-agent) coding sessions to a live web app in real time.

## Install

```bash
npm install pi-web-sync
```

## Configuration

You must provide the URLs for a WebSocket relay and web app (see the [main repository](https://github.com/yinloo-ola/pi-web-sync) for self-hosting instructions).

| Variable | Required | Description |
|---|---|---|
| `PI_WEB_SYNC_RELAY_URL` | Yes | WebSocket relay URL |
| `PI_WEB_SYNC_WEBAPP_URL` | Yes | Web app base URL (for session URL display) |

The extension checks these on load and warns if they're missing. You can also set them at runtime:

```bash
/web-sync connect wss://your-relay.example.com https://your-webapp.example.com
```

## How it works

- Each pi session generates a unique session ID
- The extension streams your conversation to a WebSocket relay
- Open the session URL in any browser to mirror your chat
- Type in the browser and it reaches pi

## License

MIT