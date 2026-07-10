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

    if (!clientType || !["pi", "web"].includes(clientType)) {
      return new Response("Missing ?client=pi or ?client=web", { status: 400 });
    }

    // Create WebSocket pair
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();

    // Store this connection, close old one of same type
    if (clientType === "pi") {
      this.pi?.close();
      this.pi = server;
    } else {
      this.web?.close();
      this.web = server;
    }

    // Notify the new client about the other peer's status
    const other = clientType === "pi" ? this.web : this.pi;
    const sessionId = url.pathname.split("/").pop() ?? "";
    if (other && other.readyState === WebSocket.READY_STATE_OPEN) {
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
      const other = clientType === "pi" ? this.web : this.pi;
      if (other && other.readyState === WebSocket.READY_STATE_OPEN) {
        other.send(event.data as string);
      }
    });

    // On disconnect, notify the other peer
    server.addEventListener("close", () => {
      const other = clientType === "pi" ? this.web : this.pi;
      if (other && other.readyState === WebSocket.READY_STATE_OPEN) {
        other.send(JSON.stringify({
          type: "peer_disconnected",
          sessionId,
          payload: { peer: clientType },
        }));
      }
      if (clientType === "pi") this.pi = null;
      else this.web = null;
    });

    server.addEventListener("error", () => {
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

    // Extract session ID from path: /session/:id
    const match = url.pathname.match(/^\/session\/([a-f0-9]+)$/);
    if (!match) {
      return new Response("Not found. Use /session/<session-id>", { status: 404 });
    }

    const sessionId = match[1];

    // Route to Durable Object for this session
    const doId = env.SESSION.idFromName(sessionId);
    const stub = env.SESSION.get(doId);

    return stub.fetch(request);
  },
};