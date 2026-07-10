/**
 * Standalone Node.js WebSocket relay for local development.
 *
 * Usage: npx tsx relay-server.ts
 * Listens on PORT (default 8787).
 */

import { WebSocketServer } from "ws";

const PORT = parseInt(process.env.PORT ?? "8787", 10);

/** Session ID → paired connections (pi + web) */
const sessions = new Map<string, { pi: WebSocket | null; web: WebSocket | null }>();

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws, request) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const match = url.pathname.match(/^\/session\/([a-f0-9]+)$/);

  if (!match) {
    console.error(`[relay] rejected: invalid path "${url.pathname}"`);
    ws.close(4001, "Invalid session path — expected /session/<hex-id>");
    return;
  }

  const sessionId = match[1];
  const clientType = url.searchParams.get("client");

  if (!clientType || !["pi", "web"].includes(clientType)) {
    console.error(`[relay] rejected: invalid client "${clientType}"`);
    ws.close(4001, 'Missing or invalid ?client=pi or ?client=web');
    return;
  }

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

  console.log(`[relay] ${clientType} connected to session ${sessionId} (${sessions.size} active sessions)`);

  // Forward messages to the other client
  ws.on("message", (data) => {
    const other = clientType === "pi" ? pair.web : pair.pi;
    if (other && other.readyState === ws.OPEN) {
      other.send(data);
      console.log(`[relay] forwarded ${data.toString().length} bytes: ${clientType} → ${clientType === "pi" ? "web" : "pi"}`);
    } else {
      console.log(`[relay] no paired client for ${clientType} in session ${sessionId}`);
    }
  });

  ws.on("close", (code, reason) => {
    if (clientType === "pi") pair.pi = null;
    else pair.web = null;
    if (!pair.pi && !pair.web) sessions.delete(sessionId);
    console.log(`[relay] ${clientType} disconnected from session ${sessionId} (code=${code}, reason=${reason})`);
  });

  ws.on("error", (err) => {
    console.error(`[relay] ${clientType} error:`, err.message);
  });
});

console.log(`pi-web-sync relay listening on ws://localhost:${PORT}`);