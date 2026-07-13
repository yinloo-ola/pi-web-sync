/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare Worker WebSocket relay (PRODUCTION).
 *
 * Uses Durable Objects to share WebSocket state across Workers.
 * Each session gets its own Durable Object instance.
 *
 * Deploy:
 *   wrangler deploy
 *
 * Local dev: use relay-server.ts (npm run dev)
 */

import { CLOSE_DUPLICATE_WEB, isOpen } from "./close-codes";
import { parseSessionWsPath } from "pi-web-sync-protocol";

interface Env {
  SESSION: DurableObjectNamespace;
}

/** Durable Object that holds WebSocket connections for one session and relays messages between them. */
export class SessionDO implements DurableObject {
  private storage: DurableObjectStorage;

  // WebSocket connections
  private pi: WebSocket | null = null;
  private web: WebSocket | null = null;

  constructor(ctx: DurableObjectState) {
    this.storage = ctx.storage;
  }

  /** Called when a client connects to this DO via the Worker's fetch handler. */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const clientType = url.searchParams.get("client");
    const sessionId = url.pathname.split("/").pop() ?? "";

    if (!clientType || !["pi", "web"].includes(clientType)) {
      return new Response("Missing ?client=pi or ?client=web", { status: 400 });
    }

    // Create WebSocket pair
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();

    // Single-browser-tab policy (matches the dev relay in relay-server.ts):
    // reject a second *web* client while the first is still live. Pi may still
    // replace pi. The web app recognizes the close code so it doesn't
    // reconnect-loop against the relay. (A half-open zombie — no close frame —
    // still looks OPEN until TCP times out; ticket 0006's heartbeat closes it.)
    if (clientType === "web" && isOpen(this.web)) {
      console.warn(`[pi-web-sync] web rejected for session ${sessionId} — duplicate tab`);
      server.close(CLOSE_DUPLICATE_WEB, "Session already has an active browser");
      return new Response(null, { status: 101, webSocket: client });
    }

    // Store this connection, close old one of same type
    if (clientType === "pi") {
      this.pi?.close();
      this.pi = server;
    } else {
      this.web?.close();
      this.web = server;
    }
    console.log(`[pi-web-sync] ${clientType} connected to session ${sessionId}`);

    // Notify the new client about the other peer's status
    const other = clientType === "pi" ? this.web : this.pi;
    if (isOpen(other)) {
      server.send(JSON.stringify({
        type: "peer_connected",
        sessionId,
        payload: { peer: clientType === "pi" ? "web" : "pi" },
      }));
      other.send(JSON.stringify({
        type: "peer_connected",
        sessionId,
        payload: { peer: clientType },
      }));
    } else {
      server.send(JSON.stringify({
        type: "peer_disconnected",
        sessionId,
        payload: { peer: clientType === "pi" ? "web" : "pi" },
      }));
    }

    // Forward messages to the other peer
    server.addEventListener("message", (event: MessageEvent) => {
      const data = event.data as string;

      // Heartbeat: answer pings directly (don't forward), so a client with no
      // peer can still probe its own leg to the relay. See ticket 0006.
      let msgType: string | undefined;
      try {
        msgType = (JSON.parse(data) as { type?: string }).type;
      } catch {
        // malformed — fall through and forward
      }
      if (msgType === "ping") {
        if (isOpen(server)) server.send(JSON.stringify({ type: "pong", sessionId, payload: {} }));
        return;
      }
      if (msgType === "pong") return;

      const other = clientType === "pi" ? this.web : this.pi;
      if (isOpen(other)) {
        other.send(data);
        console.debug(`[pi-web-sync] forwarded ${data.length} bytes: ${clientType} → ${clientType === "pi" ? "web" : "pi"}`);
      } else {
        console.debug(`[pi-web-sync] no paired client for ${clientType} in session ${sessionId}`);
      }
    });

    // On disconnect, notify the other peer
    server.addEventListener("close", (event: CloseEvent) => {
      const other = clientType === "pi" ? this.web : this.pi;
      if (isOpen(other)) {
        other.send(JSON.stringify({
          type: "peer_disconnected",
          sessionId,
          payload: { peer: clientType },
        }));
      }
      if (clientType === "pi") this.pi = null;
      else this.web = null;
      console.log(`[pi-web-sync] ${clientType} disconnected from session ${sessionId} (code=${event.code}, reason=${event.reason})`);
    });

    server.addEventListener("error", (event: Event) => {
      console.error(`[pi-web-sync] ${clientType} error in session ${sessionId}:`, event);
      if (clientType === "pi") this.pi = null;
      else this.web = null;
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}

/** Cloudflare Worker entry point. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    const parsed = parseSessionWsPath(url.pathname);
    if (!parsed) {
      return new Response("Not found. Use /session/<session-id>", { status: 404 });
    }

    const sessionId = parsed.sessionId;

    // Route to Durable Object for this session
    const doId = env.SESSION.idFromName(sessionId);
    const stub = env.SESSION.get(doId);

    return stub.fetch(request);
  },
};