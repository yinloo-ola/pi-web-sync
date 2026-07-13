/**
 * Transport-agnostic relay session.
 *
 * Owns the session policy — single-web-tab enforcement, peer-status fanout,
 * message forwarding, and ping/pong interception — that was previously
 * duplicated across the dev relay and the production Durable Object.
 *
 * Each transport (ws, WebSocketPair) implements `RelaySocket` and delegates
 * to `RelaySession`. All existing characterization tests from ticket 0038
 * pass unchanged through the dev adapter.
 */
import {
  CLOSE_DUPLICATE_WEB,
} from "pi-web-sync-protocol";

// ---------------------------------------------------------------------------
// Transport-agnostic socket interface
// ---------------------------------------------------------------------------

export interface RelaySocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly isOpen: boolean;
  onMessage(handler: (data: string) => void): void;
  onClose(handler: (code: number, reason: string) => void): void;
}

// ---------------------------------------------------------------------------
// Client type
// ---------------------------------------------------------------------------

type ClientType = "pi" | "web";

// ---------------------------------------------------------------------------
// RelaySession — one per session ID
// ---------------------------------------------------------------------------

export class RelaySession {
  private pi: RelaySocket | null = null;
  private web: RelaySocket | null = null;
  readonly sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Register a client into the session. Returns true on success; returns
   * false if the client is a second web while the first is still open
   * (the caller should reject the connection with CLOSE_DUPLICATE_WEB).
   */
  addClient(clientType: ClientType, socket: RelaySocket): boolean {
    // Single-browser-tab policy: reject a second web while first is live.
    const existing = clientType === "pi" ? this.pi : this.web;
    if (clientType === "web" && isOpen(this.web)) {
      return false;
    }

    // Notify the old same-type socket before replacing it (same-type-replace
    // divergence resolved by adopting the dev relay's behavior — ADR-005).
    if (isOpen(existing)) {
      existing.send(
        JSON.stringify({
          type: "peer_disconnected",
          sessionId: this.sessionId,
          payload: { peer: clientType },
        }),
      );
      existing.close();
    }

    // Store the new socket.
    if (clientType === "pi") {
      this.pi = socket;
    } else {
      this.web = socket;
    }

    // Register event handlers.
    this.registerHandlers(clientType, socket);

    // Fanout: notify peers about the new connection.
    const other = clientType === "pi" ? this.web : this.pi;
    if (isOpen(other)) {
      // The new client learns about the existing peer.
      socket.send(
        JSON.stringify({
          type: "peer_connected",
          sessionId: this.sessionId,
          payload: { peer: clientType === "pi" ? "web" : "pi" },
        }),
      );
      // The existing peer learns about the new client.
      other.send(
        JSON.stringify({
          type: "peer_connected",
          sessionId: this.sessionId,
          payload: { peer: clientType },
        }),
      );
    } else {
      // No other peer — tell the new client there's none.
      socket.send(
        JSON.stringify({
          type: "peer_disconnected",
          sessionId: this.sessionId,
          payload: { peer: clientType === "pi" ? "web" : "pi" },
        }),
      );
    }

    return true;
  }

  /** Returns whether both slots are empty (session can be reaped). */
  get isEmpty(): boolean {
    return !this.pi && !this.web;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private registerHandlers(clientType: ClientType, socket: RelaySocket): void {
    socket.onMessage((data) => this.handleMessage(clientType, socket, data));
    socket.onClose(() => this.handleClose(clientType));
  }

  private handleMessage(clientType: ClientType, socket: RelaySocket, data: string): void {
    // Heartbeat: intercept ping/pong — do NOT forward.
    let msgType: string | undefined;
    try {
      msgType = (JSON.parse(data) as { type?: string }).type;
    } catch {
      // malformed wire message — fall through and forward as-is.
    }
    if (msgType === "ping") {
      if (socket.isOpen) {
        socket.send(JSON.stringify({ type: "pong", sessionId: this.sessionId, payload: {} }));
      }
      return;
    }
    if (msgType === "pong") return;

    // Forward to the other peer.
    const other = clientType === "pi" ? this.web : this.pi;
    if (other?.isOpen) {
      other.send(data);
    }
  }

  private handleClose(clientType: ClientType): void {
    // Null out the slot.
    if (clientType === "pi") {
      this.pi = null;
    } else {
      this.web = null;
    }

    // Notify the other peer.
    const other = clientType === "pi" ? this.web : this.pi;
    if (other?.isOpen) {
      other.send(
        JSON.stringify({
          type: "peer_disconnected",
          sessionId: this.sessionId,
          payload: { peer: clientType },
        }),
      );
    }
  }
}

/** OPEN readyState value. */
const OPEN = 1;

/** True if the socket is present and in OPEN state. */
function isOpen(socket: RelaySocket | null | undefined): socket is RelaySocket {
  return socket !== null && socket !== undefined && socket.isOpen;
}