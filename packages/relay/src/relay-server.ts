/**
 * Standalone Node.js WebSocket relay for local development.
 *
 * Usage: npx tsx src/relay-server.ts   (or: npm run dev)
 * Listens on PORT (default 8787).
 *
 * This is a thin adapter: it owns session keying, URL/client validation,
 * and WebSocket acquisition. All session policy (single-tab enforcement,
 * peer-status fanout, message forwarding, heartbeat interception) lives
 * in `RelaySession`.
 */

import { basename } from "node:path";
import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import {
  CLOSE_DUPLICATE_WEB,
  CLOSE_INVALID_REQUEST,
} from "./close-codes";
import { parseSessionWsPath } from "pi-web-sync-protocol";
import { RelaySession } from "./relay-session";
import { WsRelaySocket } from "./ws-relay-socket";

const PORT = parseInt(process.env.PORT ?? "8787", 10);

/** Session ID → relay session. */
export type Sessions = Map<string, RelaySession>;

/**
 * Handle one inbound WebSocket connection. Extracted (and exported) so the
 * session policy can be exercised against a live `WebSocketServer` in tests
 * via {@link createRelay}.
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

  const clientType = url.searchParams.get("client");

  if (!clientType || !["pi", "web"].includes(clientType)) {
    ws.close(CLOSE_INVALID_REQUEST, "Missing or invalid ?client=pi or ?client=web");
    return;
  }

  const sessionId = parsed.sessionId;
  const session = sessions.get(sessionId) ?? new RelaySession(sessionId);
  const socket = new WsRelaySocket(ws);

  const accepted = session.addClient(clientType as "pi" | "web", socket);
  if (!accepted) {
    ws.close(CLOSE_DUPLICATE_WEB, "Session already has an active browser");
    return;
  }

  sessions.set(sessionId, session);
  console.log(
    `[pi-web-sync] ${clientType} connected to session ${sessionId} (${sessions.size} active sessions)`,
  );

  // Reap the session when both peers are gone.
  ws.on("close", (code, reason) => {
    if (session.isEmpty) {
      sessions.delete(sessionId);
    }
    console.log(`[pi-web-sync] ${clientType} disconnected from session ${sessionId} (code=${code}, reason=${reason})`);
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