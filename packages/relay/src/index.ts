/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare Worker WebSocket relay (PRODUCTION).
 *
 * NOTE: This requires Durable Objects for production deployment.
 * Cloudflare Workers cannot share WebSocket objects across fetch requests
 * without Durable Objects ("Cannot perform I/O on behalf of a different request").
 *
 * For local development, use relay-server.ts instead:
 *   cd packages/relay && npm run dev
 */

interface Env {
  // Cloudflare Worker env bindings (if any)
}

/** Session ID → paired WebSocket connections (pi + web). */
const sessions = new Map<string, { pi: WebSocket | null; web: WebSocket | null }>();

/** Cloudflare Worker that relays WebSocket messages between pi and web app. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Extract session ID from path: /session/:id
    const match = url.pathname.match(/^\/session\/([a-f0-9]+)$/);
    if (!match) {
      return new Response("Not found. Use /session/<session-id>", { status: 404 });
    }

    const sessionId = match[1];
    const clientType = url.searchParams.get("client"); // "pi" or "web"

    if (!clientType || !["pi", "web"].includes(clientType)) {
      return new Response("Missing ?client=pi or ?client=web", { status: 400 });
    }

    // Upgrade to WebSocket
    const pair = sessions.get(sessionId) ?? { pi: null, web: null };

    // HAZARD: WebSocket upgrade API — verify Cloudflare Worker WebSocket upgrade pattern
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Accept the server side
    server.accept();

    // Store this client
    if (clientType === "pi") {
      // Close existing pi connection if any
      pair.pi?.close();
      pair.pi = server;
    } else {
      // Close existing web connection if any
      pair.web?.close();
      pair.web = server;
    }
    sessions.set(sessionId, pair);

    // Set up message forwarding
    setupForwarding(server, clientType, pair);

    // Handle disconnection
    server.addEventListener("close", () => {
      if (clientType === "pi") pair.pi = null;
      else pair.web = null;
      if (!pair.pi && !pair.web) sessions.delete(sessionId);
    });

    return new Response(null, { status: 101, webSocket: client });
  },
};

/** Forward messages from one client to the other. */
function setupForwarding(
  ws: WebSocket,
  clientType: string,
  pair: { pi: WebSocket | null; web: WebSocket | null },
): void {
  ws.addEventListener("message", (event) => {
    const other = clientType === "pi" ? pair.web : pair.pi;
    if (other && other.readyState === WebSocket.READY_STATE_OPEN) {
      other.send(event.data);
    }
  });
}