/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare Worker WebSocket relay (PRODUCTION).
 *
 * Uses Durable Objects to share WebSocket state across Workers.
 * Each session gets its own Durable Object instance.
 *
 * The DO is now a thin adapter over RelaySession — same policy as the
 * dev relay. All session policy (single-tab enforcement, peer-status
 * fanout, message forwarding, heartbeat interception) lives in
 * RelaySession.
 *
 * Deploy:
 *   wrangler deploy
 *
 * Local dev: use relay-server.ts (npm run dev)
 */

import { CLOSE_DUPLICATE_WEB } from "pi-web-sync-protocol";
import { parseSessionWsPath } from "pi-web-sync-protocol";
import { RelaySession } from "./relay-session";
import { DoRelaySocket } from "./do-relay-socket";

interface Env {
  SESSION: DurableObjectNamespace;
}

/** Durable Object that holds WebSocket connections for one session and relays messages between them. */
export class SessionDO implements DurableObject {
  private storage: DurableObjectStorage;
  private session: RelaySession;

  constructor(ctx: DurableObjectState) {
    this.storage = ctx.storage;
    this.session = new RelaySession(ctx.id.toString());
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

    // Delegate to RelaySession for all session policy.
    const socket = new DoRelaySocket(server);
    const accepted = this.session.addClient(clientType as "pi" | "web", socket);
    if (!accepted) {
      // Duplicate web — close the server side; the web app recognizes this code.
      server.close(CLOSE_DUPLICATE_WEB, "Session already has an active browser");
      console.warn(`[pi-web-sync] web rejected for session ${this.session.sessionId} — duplicate tab`);
      return new Response(null, { status: 101, webSocket: client });
    }

    console.log(`[pi-web-sync] ${clientType} connected to session ${this.session.sessionId}`);
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