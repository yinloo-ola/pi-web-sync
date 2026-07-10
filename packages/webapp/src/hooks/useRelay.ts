import { stub } from "../../../_ptk/stub";
import type { RelayMessage } from "../types";

/** Connection state for the relay WebSocket. */
export type RelayState = "connecting" | "connected" | "disconnected" | "error";

/** Hook that manages WebSocket connection to the relay. Returns state, send function, and message handler. */
export function useRelay(
  sessionId: string,
  relayUrl: string,
  onMessage: (msg: RelayMessage) => void,
): {
  state: RelayState;
  send: (msg: RelayMessage) => void;
  reconnect: () => void;
} {
  return stub("webapp.useRelay");
}