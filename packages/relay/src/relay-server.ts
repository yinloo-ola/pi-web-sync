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

  // Notify the existing peer BEFORE replacing the connection
  const wasConnected = clientType === "pi" ? pair.pi !== null : pair.web !== null;
  if (wasConnected) {
    const existingPeer = clientType === "pi" ? pair.pi : pair.web;
    if (existingPeer && existingPeer.readyState === ws.OPEN) {
      existingPeer.send(JSON.stringify({
        type: "peer_disconnected",
        sessionId,
        payload: { peer: clientType },
      }));
    }
  }

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

  // Notify the new client about the other peer's status
  const otherPeer = clientType === "pi" ? pair.web : pair.pi;
  if (otherPeer && otherPeer.readyState === ws.OPEN) {
    ws.send(JSON.stringify({
      type: "peer_connected",
      sessionId,
      payload: { peer: clientType === "pi" ? "web" : "pi" },
    }));
    // Also notify the existing peer that the new client joined
    otherPeer.send(JSON.stringify({
      type: "peer_connected",
      sessionId,
      payload: { peer: clientType },
    }));
  } else {
    // No other peer — tell the new client there's none
    ws.send(JSON.stringify({
      type: "peer_disconnected",
      sessionId,
      payload: { peer: clientType === "pi" ? "web" : "pi" },
    }));
  }

  // Forward messages to the other client
  ws.on("message", (data: Buffer | string) => {
    const text = data.toString();
    const other = clientType === "pi" ? pair.web : pair.pi;
    if (other && other.readyState === ws.OPEN) {
      // Send as text frame (string) so browser receives string instead of Blob
      other.send(text);
      console.log(`[relay] forwarded ${text.length} bytes: ${clientType} → ${clientType === "pi" ? "web" : "pi"}`);
    } else {
      console.log(`[relay] no paired client for ${clientType} in session ${sessionId}`);
    }
  });

  ws.on("close", (code, reason) => {
    if (clientType === "pi") pair.pi = null;
    else pair.web = null;

    // Notify the other peer that this one disconnected
    const other = clientType === "pi" ? pair.web : pair.pi;
    if (other && other.readyState === ws.OPEN) {
      other.send(JSON.stringify({
        type: "peer_disconnected",
        sessionId,
        payload: { peer: clientType },
      }));
    }

    if (!pair.pi && !pair.web) sessions.delete(sessionId);
    console.log(`[relay] ${clientType} disconnected from session ${sessionId} (code=${code}, reason=${reason})`);
  });

  ws.on("error", (err) => {
    console.error(`[relay] ${clientType} error:`, err.message);
  });
});

console.log(`pi-web-sync relay listening on ws://localhost:${PORT}`);