import type { RelayMessage } from "./types";

/** WebSocket client that connects to the Cloudflare Worker relay. */
export class RelayClient {
  private ws: WebSocket | null = null;
  private url: string;
  private sessionId: string;
  private messageHandler: ((msg: RelayMessage) => void) | null = null;
  private syncRequestHandler: (() => void) | null = null;

  constructor(url: string, sessionId: string) {
    this.url = url;
    this.sessionId = sessionId;
  }

  /** Connect to the relay WebSocket. Resolves when connected. */
  async connect(): Promise<void> {
    const ws = new WebSocket(`${this.url}/session/${this.sessionId}?client=pi`);

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", () => reject(new Error("WebSocket connection failed")));
    });

    ws.addEventListener("message", (event) => {
      try {
        const msg: RelayMessage = JSON.parse(event.data as string);
        if (msg.type === "sync_request") {
          this.syncRequestHandler?.();
        } else {
          this.messageHandler?.(msg);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    this.ws = ws;
  }

  /** Disconnect from the relay. */
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  /** Send a message to the relay. */
  send(message: RelayMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /** Register handler for incoming messages from the web app. */
  onMessage(handler: (msg: RelayMessage) => void): void {
    this.messageHandler = handler;
  }

  /** Register handler for sync requests from the web app. */
  onSyncRequest(handler: () => void): void {
    this.syncRequestHandler = handler;
  }
}