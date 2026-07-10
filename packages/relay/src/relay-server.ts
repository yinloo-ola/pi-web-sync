/**
 * Standalone Node.js WebSocket relay for local development.
 *
 * Replaces the Cloudflare Worker during local testing.
 * The Worker version (index.ts) is for production deployment with Durable Objects.
 *
 * Usage: npx tsx relay-server.ts
 * Listens on PORT (default 8787).
 */

import { createServer } from "http";
import { WebSocketServer } from "ws";

const PORT = parseInt(process.env.PORT ?? "8787", 10);

// Session ID → paired connections (pi + web)
const sessions = new Map<string, { pi: WebSocket | null; web: WebSocket | null }>();

const wss = new WebSocketServer({ noServer: true });

const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("pi-web-sync relay (Node.js)\n");
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "", `http://${request.headers.host}`);
  const match = url.pathname.match(/^\/session\/([a-f0-9]+)$/);

  if (!match) {
    socket.destroy();
    return;
  }

  const sessionId = match[1];
  const clientType = url.searchParams.get("client"); // "pi" or "web"

  if (!clientType || !["pi", "web"].includes(clientType)) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request, sessionId, clientType);
  });
});

wss.on("connection", (ws, _request, sessionId: string, clientType: string) => {
  const pair = sessions.get(sessionId) ?? { pi: null, web: null };

  // Close existing connection of same type, store new one
  if (clientType === "pi") {
    pair.pi?.close();
    pair.pi = ws;
  } else {
    pair.web?.close();
    pair.web = ws;
  }
  sessions.set(sessionId, pair);

  console.log(`[${clientType}] connected to session ${sessionId}`);

  // Forward messages to the other client
  ws.on("message", (data) => {
    const other = clientType === "pi" ? pair.web : pair.pi;
    if (other && other.readyState === ws.OPEN) {
      other.send(data);
    }
  });

  ws.on("close", () => {
    if (clientType === "pi") pair.pi = null;
    else pair.web = null;
    if (!pair.pi && !pair.web) sessions.delete(sessionId);
    console.log(`[${clientType}] disconnected from session ${sessionId}`);
  });

  ws.on("error", (err) => {
    console.error(`[${clientType}] error:`, err.message);
  });
});

server.listen(PORT, () => {
  console.log(`pi-web-sync relay listening on ws://localhost:${PORT}`);
});