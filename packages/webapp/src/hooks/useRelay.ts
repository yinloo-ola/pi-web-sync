import { useCallback, useEffect, useRef, useState } from "react";
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
  const [state, setState] = useState<RelayState>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setState("connecting");
    const url = new URL(relayUrl);
    url.searchParams.set("sessionId", sessionId);
    url.searchParams.set("client", "web");

    const ws = new WebSocket(url.toString());
    wsRef.current = ws;

    ws.addEventListener("open", () => setState("connected"));
    ws.addEventListener("close", () => setState("disconnected"));
    ws.addEventListener("error", () => setState("error"));
    ws.addEventListener("message", (event) => {
      try {
        const msg: RelayMessage = JSON.parse(event.data as string);
        onMessageRef.current(msg);
      } catch {
        // Ignore malformed messages
      }
    });
  }, [relayUrl, sessionId]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback(
    (message: RelayMessage) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message));
      }
    },
    [],
  );

  const reconnect = useCallback(() => {
    connect();
  }, [connect]);

  return { state, send, reconnect };
}