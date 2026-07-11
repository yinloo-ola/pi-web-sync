import { WebSocket as ReconnectingWebSocket } from "partysocket";
import type { Options as ReconnectOptions } from "partysocket/ws";
import WS from "ws";
import type { RelayMessage } from "./types";

/** Connection state surfaced to the extension UI (footer). */
export type ConnectionState = "connected" | "reconnecting" | "failed";

/**
 * Reconnect policy. MUST match the web app (ticket 0002) so both halves of the
 * connection behave identically.
 */
export const MAX_RETRIES = 10;
const MIN_UPTIME_MS = 5000;
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

const RECONNECT_OPTIONS: ReconnectOptions = {
  maxRetries: MAX_RETRIES,
  minReconnectionDelay: 1000, // partysocket adds its own jitter on top
  maxReconnectionDelay: 30000,
  reconnectionDelayGrowFactor: 1.3,
  maxEnqueuedMessages: 100,
  connectionTimeout: 4000,
  minUptime: MIN_UPTIME_MS,
};

/** Options for RelayClient. `WebSocket` is a test seam. */
export interface RelayClientOptions {
  /** WebSocket constructor for partysocket to wrap. Defaults to the `ws` package. */
  WebSocket?: ReconnectOptions["WebSocket"];
  /** App-level heartbeat configuration (ticket 0006). Test overrides use short intervals. */
  heartbeat?: {
    /** Milliseconds between pings (default 30_000). */
    pingIntervalMs?: number;
    /** Milliseconds to wait for a pong before reconnecting (default 10_000). */
    pongTimeoutMs?: number;
  };
}

/**
 * WebSocket client that connects to the relay with automatic reconnection.
 *
 * Uses partysocket so an accidental mid-session drop reconnects with backoff
 * and outgoing messages are buffered while down (no more silent drops). The
 * message/sync handlers are attached to the persistent partysocket instance, so
 * they survive reconnects. Connection-state changes are reported via
 * {@link onStatus} so the extension can update its footer.
 */
export class RelayClient {
  private ws: ReconnectingWebSocket | null = null;
  private readonly url: string;
  private readonly sessionId: string;
  private readonly options: ReconnectOptions;
  private messageHandler: ((msg: RelayMessage) => void) | null = null;
  private syncRequestHandler: (() => void) | null = null;
  private statusHandler: ((state: ConnectionState, retryAttempt: number) => void) | null = null;

  // Reconnect accounting — mirrors the web app's useRelay (ticket 0002). We track
  // our own close counter rather than reading partysocket's retryCount: partysocket
  // emits no "gave up" event, and retryCount is ambiguous at the max-retries
  // boundary.
  private closeCount = 0;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private pongTimeout: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private opened = false;
  private readonly heartbeat: RelayClientOptions['heartbeat'];

  constructor(url: string, sessionId: string, options: RelayClientOptions = {}) {
    this.url = url;
    this.sessionId = sessionId;
    this.heartbeat = options.heartbeat;
    this.options = { ...RECONNECT_OPTIONS, WebSocket: options.WebSocket ?? WS };
  }

  /** Connect to the relay. Resolves on first open; rejects on first error. */
  async connect(): Promise<void> {
    if (this.ws) return;
    this.intentionalClose = false;
    this.opened = false;
    this.closeCount = 0;

    const wsUrl = `${this.url}/session/${this.sessionId}?client=pi`;
    const ws = new ReconnectingWebSocket(wsUrl, undefined, this.options);
    this.ws = ws;

    // Persistent handlers — attached to the partysocket instance so they survive
    // reconnects (the core fix: previously they sat on a one-shot raw socket).
    ws.addEventListener("message", (event) => {
      try {
        const msg: RelayMessage = JSON.parse(event.data as string);
        if (msg.type === "pong") {
          // Heartbeat response — clear the pending pong timeout. Not forwarded.
          if (this.pongTimeout) {
            clearTimeout(this.pongTimeout);
            this.pongTimeout = null;
          }
          return;
        }
        if (msg.type === "sync_request") {
          this.syncRequestHandler?.();
        } else if (msg.type !== "peer_disconnected") {
          this.messageHandler?.(msg);
        }
      } catch (err) {
        console.debug("[pi-web-sync] ignoring malformed wire message:", err instanceof Error ? err.message : err);
      }
    });

    ws.addEventListener("open", () => {
      this.opened = true;
      this.notify("connected", 0);
      // Reset the failure counter only once the connection proves stable
      // (mirrors partysocket's minUptime), so a flapping half-open connection
      // still eventually reaches "failed".
      this.clearStableTimer();
      this.stableTimer = setTimeout(() => {
        this.closeCount = 0;
      }, MIN_UPTIME_MS);
      this.startHeartbeat(ws);
    });

    ws.addEventListener("close", () => {
      this.clearStableTimer();
      this.stopHeartbeat();
      // Before the first open, closes belong to the initial-connect handshake
      // (handled by the promise below); ignore them here.
      if (!this.opened) return;
      if (this.intentionalClose) return; // our own disconnect()/reconnect()

      this.closeCount += 1;
      if (this.closeCount > MAX_RETRIES) {
        this.notify("failed", 0);
      } else {
        this.notify("reconnecting", this.closeCount);
      }
    });

    // Initial-connect handshake: resolve on first open, reject on first close
    // or error (partysocket dispatches close before error, so handle both).
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        ws.removeEventListener("close", onFail);
        ws.removeEventListener("error", onFail);
        ws.removeEventListener("open", onOpen);
        resolve();
      };
      const onFail = () => {
        ws.removeEventListener("close", onFail);
        ws.removeEventListener("error", onFail);
        ws.removeEventListener("open", onOpen);
        this.failInitial(ws);
        reject(new Error("WebSocket connection failed"));
      };
      ws.addEventListener("open", onOpen);
      ws.addEventListener("close", onFail);
      ws.addEventListener("error", onFail);
    });
  }

  /** Disconnect deliberately — does NOT auto-reconnect (ticket 0005). */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearStableTimer();
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }

  /** Reconnect after a failed state (e.g. user re-runs /web-sync connect). */
  reconnect(): void {
    const ws = this.ws;
    if (!ws) return;
    this.closeCount = 0;
    this.stopHeartbeat();
    this.notify("reconnecting", 0);
    // ws.reconnect() dispatches a synthetic close synchronously; ignore it so it
    // isn't mistaken for an accidental drop (which would bump the counter).
    this.intentionalClose = true;
    try {
      ws.reconnect();
    } finally {
      this.intentionalClose = false;
    }
  }

  /** Send a message. Buffered by partysocket while the socket is down. */
  send(message: RelayMessage): void {
    this.ws?.send(JSON.stringify(message));
  }

  /** Register handler for incoming messages from the web app. */
  onMessage(handler: (msg: RelayMessage) => void): void {
    this.messageHandler = handler;
  }

  /** Register handler for sync requests from the web app. */
  onSyncRequest(handler: () => void): void {
    this.syncRequestHandler = handler;
  }

  /** Register handler for connection-state changes (drives the footer). */
  onStatus(handler: (state: ConnectionState, retryAttempt: number) => void): void {
    this.statusHandler = handler;
  }

  /** Tear down a failed initial-connect attempt (stop partysocket's retries). */
  private failInitial(ws: ReconnectingWebSocket): void {
    this.intentionalClose = true;
    ws.close();
    this.ws = null;
  }

  private notify(state: ConnectionState, retryAttempt: number): void {
    this.statusHandler?.(state, retryAttempt);
  }

  private clearStableTimer(): void {
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
  }

  /** Start the app-level ping/pong heartbeat (called on each open). */
  private startHeartbeat(ws: ReconnectingWebSocket): void {
    const pingInterval = this.heartbeat?.pingIntervalMs ?? PING_INTERVAL_MS;
    const pongTimeout = this.heartbeat?.pongTimeoutMs ?? PONG_TIMEOUT_MS;
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      ws.send(JSON.stringify({ type: "ping", sessionId: this.sessionId, payload: {} }));
      // No pong within the window means the connection is a zombie; force
      // partysocket to re-establish (surfacing reconnecting/failed via onStatus).
      this.pongTimeout = setTimeout(() => this.reconnect(), pongTimeout);
    }, pingInterval);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }
}