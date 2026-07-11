import { useCallback, useEffect, useRef, useState } from "react";
import { WebSocket as ReconnectingWebSocket } from "partysocket";
import type { Options as ReconnectOptions } from "partysocket/ws";
import type { RelayMessage } from "../types";

/** Connection state for the relay WebSocket. */
export type RelayState = "connecting" | "connected" | "reconnecting" | "failed";
/** Whether pi is connected to this session. */
export type PiStatus = "connected" | "disconnected" | "unknown";

/**
 * Reconnect policy. MUST stay in sync with the extension (ticket 0003) so both
 * halves of the connection behave identically.
 *
 * `minUptime` is included explicitly because the close-counter reset below
 * mirrors it — see useRelay.
 */
const MAX_RETRIES = 10;
const MIN_UPTIME_MS = 5000;

const RECONNECT_OPTIONS: ReconnectOptions = {
  maxRetries: MAX_RETRIES,
  minReconnectionDelay: 1000, // partysocket adds its own jitter on top
  maxReconnectionDelay: 30000,
  reconnectionDelayGrowFactor: 1.3,
  maxEnqueuedMessages: 100,
  connectionTimeout: 4000,
  minUptime: MIN_UPTIME_MS,
};

/** Hook that manages the relay WebSocket connection with auto-reconnect. */
export function useRelay(
  sessionId: string,
  relayUrl: string,
  onMessage: (msg: RelayMessage) => void,
): {
  state: RelayState;
  piStatus: PiStatus;
  /** Current reconnect attempt (1-based) while `state === "reconnecting"`; 0 otherwise. */
  retryAttempt: number;
  send: (msg: RelayMessage) => void;
  reconnect: () => void;
} {
  const [state, setState] = useState<RelayState>("connecting");
  const [piStatus, setPiStatus] = useState<PiStatus>("unknown");
  const [retryAttempt, setRetryAttempt] = useState(0);

  const wsRef = useRef<ReconnectingWebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // Number of accidental closes since the connection last stayed up for
  // minUptime. Drives the "reconnecting (attempt N)" label and the "failed"
  // gate. We track our own counter instead of reading `ws.retryCount`:
  // partysocket emits no distinct "gave up" event, and at the boundary the
  // close that schedules the final retry and the close that gives up both
  // report `retryCount === maxRetries` — so retryCount alone is ambiguous.
  const closeCountRef = useRef(0);
  // Timer that mirrors partysocket's internal `_acceptOpen`: the connection
  // only counts as stable (and resets the failure counter) once it has stayed
  // open for minUptime. Without this, a half-open socket that opens briefly
  // then drops would reset the counter on every open and never reach "failed".
  const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    intentionalCloseRef.current = false;
    closeCountRef.current = 0;
    setState("connecting");

    const wsUrl = `${relayUrl}/session/${sessionId}?client=web`;
    const ws = new ReconnectingWebSocket(wsUrl, undefined, RECONNECT_OPTIONS);
    wsRef.current = ws;

    const clearStableTimer = () => {
      if (stableTimerRef.current) {
        clearTimeout(stableTimerRef.current);
        stableTimerRef.current = null;
      }
    };

    ws.addEventListener("open", () => {
      if (!aliveRef.current) return;
      setState("connected");
      // Recover full history from pi on every (re)connect.
      ws.send(
        JSON.stringify({ type: "sync_request", sessionId, payload: {} }),
      );
      // Defer the failure-counter reset until the connection proves stable,
      // matching partysocket's minUptime semantics.
      clearStableTimer();
      stableTimerRef.current = setTimeout(() => {
        closeCountRef.current = 0;
        setRetryAttempt(0);
      }, MIN_UPTIME_MS);
    });

    ws.addEventListener("message", async (event) => {
      if (!aliveRef.current) return;
      try {
        // event.data is string (text frame) or Blob (binary frame)
        const raw =
          event.data instanceof Blob ? await event.data.text() : event.data;
        const msg: RelayMessage = JSON.parse(raw as string);

        if (msg.type === "peer_connected" || msg.type === "peer_disconnected") {
          const payload = msg.payload as { peer: string };
          if (payload.peer === "pi") {
            setPiStatus(
              msg.type === "peer_connected" ? "connected" : "disconnected",
            );
          }
          return; // peer-status messages are not forwarded to the app
        }

        onMessageRef.current(msg);
      } catch (e) {
        console.error("[useRelay] failed to parse message:", e);
      }
    });

    ws.addEventListener("close", () => {
      if (!aliveRef.current) return;
      clearStableTimer();

      if (intentionalCloseRef.current) return; // synthetic close from our own reconnect(); ignore

      // Accidental close. partysocket has already decided by now: it either
      // scheduled another retry or gave up at maxRetries. Our counter climbs in
      // lockstep with its retries (both reset only after minUptime), so
      // exceeding maxRetries here means partysocket has stopped retrying.
      closeCountRef.current += 1;
      const attempt = closeCountRef.current;
      if (attempt > MAX_RETRIES) {
        setRetryAttempt(0);
        setState("failed");
      } else {
        setRetryAttempt(attempt);
        setState("reconnecting");
      }
    });

    return () => {
      aliveRef.current = false;
      intentionalCloseRef.current = true;
      clearStableTimer();
      // Deliberate close: partysocket will NOT auto-reconnect (ticket 0005).
      ws.close();
      wsRef.current = null;
    };
  }, [relayUrl, sessionId]);

  const send = useCallback((message: RelayMessage) => {
    // Always hand the message to partysocket. While the socket is down it
    // buffers up to `maxEnqueuedMessages` and flushes the queue before the next
    // "open". Guarding on readyState here would silently drop messages during
    // an outage — the old behavior this ticket replaces.
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  const reconnect = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    closeCountRef.current = 0;
    setRetryAttempt(0);
    intentionalCloseRef.current = false;
    setState("connecting");
    // ws.reconnect() dispatches a synthetic close synchronously; ignore it so
    // it isn't mistaken for an accidental close (which would bump the counter).
    intentionalCloseRef.current = true;
    try {
      ws.reconnect(); // resets partysocket's retry counter and reconnects
    } finally {
      intentionalCloseRef.current = false;
    }
  }, []);

  return { state, piStatus, retryAttempt, send, reconnect };
}