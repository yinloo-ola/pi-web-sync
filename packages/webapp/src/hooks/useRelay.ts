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
      console.log("[useRelay] closing existing WebSocket");
      wsRef.current.close();
    }

    setState("connecting");
    const wsUrl = `${relayUrl}/session/${sessionId}?client=web`;
    console.log("[useRelay] connecting to", wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      console.log("[useRelay] connected");
      setState("connected");
      // Request full history from pi on connect
      ws.send(JSON.stringify({
        type: "sync_request",
        sessionId,
        payload: {},
      }));
      console.log("[useRelay] sent sync_request");
    });
    ws.addEventListener("close", (event) => {
      console.log("[useRelay] closed: code=", event.code, "reason=", event.reason);
      setState("disconnected");
    });
    ws.addEventListener("error", (event) => {
      console.error("[useRelay] error event", event);
      setState("error");
    });
    ws.addEventListener("message", (event) => {
      try {
        const msg: RelayMessage = JSON.parse(event.data as string);
        console.log("[useRelay] received message:", msg.type, "payload:", JSON.stringify(msg.payload).slice(0, 100));
        onMessageRef.current(msg);
      } catch (e) {
        console.error("[useRelay] failed to parse message:", event.data, e);
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