/**
 * `ws`-library adapter for `RelaySocket`.
 *
 * Wraps a `ws.WebSocket` into the transport-agnostic `RelaySocket` interface
 * used by `RelaySession`. The dev relay creates one of these per connection.
 */
import { WebSocket as WsWebSocket } from "ws";
import type { RelaySocket } from "./relay-session";

const OPEN = 1;

export class WsRelaySocket implements RelaySocket {
  constructor(private readonly ws: WsWebSocket) {}

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
    this.ws.on("message", (data: Buffer | string) => {
      handler(data.toString());
    });
  }

  onClose(handler: (code: number, reason: string) => void): void {
    this.ws.on("close", (code: number, reason: Buffer) => {
      handler(code, reason.toString());
    });
  }
}