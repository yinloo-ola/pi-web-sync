import { stub } from "../_ptk/stub";
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
    return stub("relay-client.connect");
  }

  /** Disconnect from the relay. */
  disconnect(): void {
    stub("relay-client.disconnect");
  }

  /** Send a message to the relay. */
  send(message: RelayMessage): void {
    stub("relay-client.send");
  }

  /** Register handler for incoming messages from the web app. */
  onMessage(handler: (msg: RelayMessage) => void): void {
    stub("relay-client.onMessage");
  }

  /** Register handler for sync requests from the web app. */
  onSyncRequest(handler: () => void): void {
    stub("relay-client.onSyncRequest");
  }
}