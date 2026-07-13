/**
 * Standalone Node.js WebSocket relay for local development.
 *
 * Usage: npx tsx src/relay-server.ts   (or: npm run dev)
 * Listens on PORT (default 8787).
 */

import { basename } from "node:path";
import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import {
  CLOSE_DUPLICATE_WEB,
  CLOSE_INVALID_REQUEST,
  isOpen,
} from "./close-codes";
import { parseSessionWsPath } from "pi-web-sync-protocol";

const PORT = parseInt(process.env.PORT ?? "8787", 10);

/** Session ID → paired connections (pi + web) */
export type SessionPair = { pi: WebSocket | null; web: WebSocket | null };
export type Sessions = Map<string, SessionPair>;

/**
 * Handle one inbound WebSocket connection. Extracted (and exported) so the
 * single-browser-tab policy can be exercised against a live `WebSocketServer`
 * in tests via {@link createRelay}.
 */
export function handleConnection(
  ws: WebSocket,
  request: IncomingMessage,
  sessions: Sessions,
): void {
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`,
  );
  const parsed = parseSessionWsPath(url.pathname);

  if (!parsed) {
    ws.close(CLOSE_INVALID_REQUEST, "Invalid session path — expected /session/<id>");
    return;
  }

  const sessionId = parsed.sessionId;
  const clientType = url.searchParams.get("client");

  if (!clientType || !["pi", "web"].includes(clientType)) {
    ws.close(CLOSE_INVALID_REQUEST, "Missing or invalid ?client=pi or ?client=web");
    return;
  }

  const pair = sessions.get(sessionId) ?? { pi: null, web: null };

  // Single-browser-tab policy: a second *web* client is rejected while the
  // first is still live. Pi may still replace pi — the cap is one web client,
  // not one of each type. A stale (not-OPEN) web slot is replaced below.
  // (A half-open zombie — no close frame — still looks OPEN until TCP times
  // out; ticket 0006's heartbeat closes that gap.)
  if (clientType === "web" && isOpen(pair.web)) {
    ws.close(CLOSE_DUPLICATE_WEB, "Session already has an active browser");
    return;
  }

  // Notify the existing peer of the SAME type before replacing it. For web this
  // only happens when the previous web is stale/closed (duplicates were rejected
  // above); for pi it covers the normal pi-reconnect case.
  const existingPeer = clientType === "pi" ? pair.pi : pair.web;
  if (isOpen(existingPeer)) {
    existingPeer.send(
      JSON.stringify({ type: "peer_disconnected", sessionId, payload: { peer: clientType } }),
    );
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

  console.log(
    `[pi-web-sync] ${clientType} connected to session ${sessionId} (${sessions.size} active sessions)`,
  );

  // Notify the new client about the other peer's status
  const otherPeer = clientType === "pi" ? pair.web : pair.pi;
  if (isOpen(otherPeer)) {
    ws.send(
      JSON.stringify({
        type: "peer_connected",
        sessionId,
        payload: { peer: clientType === "pi" ? "web" : "pi" },
      }),
    );
    // Also notify the existing peer that the new client joined
    otherPeer.send(
      JSON.stringify({ type: "peer_connected", sessionId, payload: { peer: clientType } }),
    );
  } else {
    // No other peer — tell the new client there's none
    ws.send(
      JSON.stringify({
        type: "peer_disconnected",
        sessionId,
        payload: { peer: clientType === "pi" ? "web" : "pi" },
      }),
    );
  }

  // Forward messages to the other client
  ws.on("message", (data: Buffer | string) => {
    const text = data.toString();

    // Heartbeat: the relay answers pings directly (does not forward), so a client
    // with no peer can still probe its own leg to the relay. See ticket 0006.
    let msgType: string | undefined;
    try {
      msgType = (JSON.parse(text) as { type?: string }).type;
    } catch {
      // malformed wire message — fall through and forward as-is
    }
    if (msgType === "ping") {
      if (isOpen(ws)) ws.send(JSON.stringify({ type: "pong", sessionId, payload: {} }));
      return;
    }
    if (msgType === "pong") return; // relay never acts on pong; drop

    const other = clientType === "pi" ? pair.web : pair.pi;
    if (isOpen(other)) {
      // Send as text frame (string) so browser receives string instead of Blob
      other.send(text);
      console.debug(
        `[pi-web-sync] forwarded ${text.length} bytes: ${clientType} → ${clientType === "pi" ? "web" : "pi"}`,
      );
    } else {
      console.debug(`[pi-web-sync] no paired client for ${clientType} in session ${sessionId}`);
    }
  });

  ws.on("close", (code, reason) => {
    if (clientType === "pi") pair.pi = null;
    else pair.web = null;

    // Notify the other peer that this one disconnected
    const other = clientType === "pi" ? pair.web : pair.pi;
    if (isOpen(other)) {
      other.send(
        JSON.stringify({ type: "peer_disconnected", sessionId, payload: { peer: clientType } }),
      );
    }

    if (!pair.pi && !pair.web) sessions.delete(sessionId);
    console.log(
      `[pi-web-sync] ${clientType} disconnected from session ${sessionId} (code=${code}, reason=${reason})`,
    );
  });

  ws.on("error", (err) => {
    console.error(`[pi-web-sync] ${clientType} error:`, err.message);
  });
}

/** Create a relay listening on `port` (0 = ephemeral). Returns the server + session map. */
export function createRelay(port: number): { wss: WebSocketServer; sessions: Sessions } {
  const sessions: Sessions = new Map();
  const wss = new WebSocketServer({ port });
  wss.on("connection", (ws, request) => handleConnection(ws, request, sessions));
  return { wss, sessions };
}

// Auto-start only when run directly as the dev entry point, not when imported
// by tests.
if (basename(process.argv[1] ?? "") === "relay-server.ts") {
  createRelay(PORT);
  console.log(`[pi-web-sync] relay listening on ws://localhost:${PORT}`);
}