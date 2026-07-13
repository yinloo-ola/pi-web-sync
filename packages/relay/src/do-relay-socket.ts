/**
 * Cloudflare Durable Object `WebSocket` adapter for `RelaySocket`.
 *
 * Wraps the DO-side WebSocket (from `WebSocketPair`) into the
 * transport-agnostic `RelaySocket` interface used by `RelaySession`.
 *
 * The WebSocket must already be `.accept()`ed before creating this adapter.
 */
import type { RelaySocket } from "./relay-session";

const OPEN = 1;

export class DoRelaySocket implements RelaySocket {
  constructor(private readonly ws: WebSocket) {}

  send(data: string): void {
    this.ws.send(data);
  }

  close(code?: number, reason?: string): void {
    this.ws.close(code, reason);
  }

  get isOpen(): boolean {
    return this.ws.readyState === OPEN;
  }

  onMessage(handler: (data: string) => void): void {
    this.ws.addEventListener("message", (event: MessageEvent) => {
      handler(event.data as string);
    });
  }

  onClose(handler: (code: number, reason: string) => void): void {
    this.ws.addEventListener("close", (event: CloseEvent) => {
      handler(event.code, event.reason ?? "");
    });
  }
}