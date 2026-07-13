import { useCallback, useEffect, useRef, useState } from "react";
import { WebSocket as ReconnectingWebSocket } from "partysocket";
import type { Options as ReconnectOptions } from "partysocket/ws";
import type { RelayMessage } from "../../../extension/types";

/** Connection state for the relay WebSocket. */
export type RelayState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed"
  | "rejected";
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
/** App-level heartbeat: ping the relay every 30s, expect a pong within 10s. */
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

/**
 * Relay close code for "another browser tab already holds this session"
 * (see packages/relay/src/close-codes.ts). Recognized here so the web app shows
 * a message instead of reconnect-looping against the relay. A shared constants
 * package (ticket 0008) will eventually remove this duplication.
 */
const CLOSE_DUPLICATE_WEB = 4002;

const RECONNECT_OPTIONS: ReconnectOptions = {
  maxRetries: MAX_RETRIES,
  minReconnectionDelay: 1000, // partysocket adds its own jitter on top
  maxReconnectionDelay: 30000,
  reconnectionDelayGrowFactor: 1.3,
  maxEnqueuedMessages: 100,
  connectionTimeout: 4000,
  minUptime: MIN_UPTIME_MS,
  // The single-browser-tab reject (ticket 0004) must NOT trigger auto-reconnect
  // or partysocket would hammer the relay forever.
  shouldReconnectOnClose: (event) => event.code !== CLOSE_DUPLICATE_WEB,
};

export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
}

export interface SkillInfo {
  name: string;
  description?: string;
  source: string;
}

/** Hook that manages the relay WebSocket connection with auto-reconnect. */
export function useRelay(
  sessionId: string,
  relayUrl: string,
  onMessage: (msg: RelayMessage) => void,
): {
  state: RelayState;
  piStatus: PiStatus;
  /** Whether the session has ended (pi sent session_ended or no pi peer within 5s). */
  sessionEnded: boolean;
  /** Available models from pi's registry. */
  availableModels: ModelInfo[];
  /** Available skills from pi's command registry. */
  availableSkills: SkillInfo[];
  /** Current reconnect attempt (1-based) while `state === "reconnecting"`; 0 otherwise. */
  retryAttempt: number;
  send: (msg: RelayMessage) => void;
  reconnect: () => void;
} {
  const [state, setState] = useState<RelayState>("connecting");
  const [piStatus, setPiStatus] = useState<PiStatus>("unknown");
  const [sessionEnded, setSessionEnded] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);
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
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pongTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Always-current reference to `reconnect`, so the heartbeat timer can call it. */
  const reconnectRef = useRef<() => void>(() => {});
  const intentionalCloseRef = useRef(false);
  const aliveRef = useRef(true);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopHeartbeat = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (pongTimeoutRef.current) {
      clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = null;
    }
  }, []);

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

    const startHeartbeat = () => {
      stopHeartbeat();
      pingIntervalRef.current = setInterval(() => {
        wsRef.current?.send(
          JSON.stringify({ type: "ping", sessionId, payload: {} }),
        );
        // No pong within the window means the connection is a zombie; force a
        // reconnect (partysocket re-establishes, surfacing reconnecting/failed).
        pongTimeoutRef.current = setTimeout(
          () => reconnectRef.current(),
          PONG_TIMEOUT_MS,
        );
      }, PING_INTERVAL_MS);
    };

    ws.addEventListener("open", () => {
      if (!aliveRef.current) return;
      setState("connected");
      setSessionEnded(false);
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
      // Stale URL detection: if no pi peer connects within 5s, the session has ended.
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
      staleTimerRef.current = setTimeout(() => {
        // Only mark as ended if we're still connected and pi hasn't connected
        if (aliveRef.current) {
          setSessionEnded(true);
        }
      }, 5000);
      startHeartbeat();
    });

    ws.addEventListener("message", async (event) => {
      if (!aliveRef.current) return;
      try {
        // event.data is string (text frame) or Blob (binary frame)
        const raw =
          event.data instanceof Blob ? await event.data.text() : event.data;
        const msg: RelayMessage = JSON.parse(raw as string);

        // Heartbeat response — clear the pending pong timeout; not forwarded.
        if (msg.type === "pong") {
          if (pongTimeoutRef.current) {
            clearTimeout(pongTimeoutRef.current);
            pongTimeoutRef.current = null;
          }
          return;
        }

        if (msg.type === "peer_connected" || msg.type === "peer_disconnected") {
          const payload = msg.payload as { peer: string };
          if (payload.peer === "pi") {
            setPiStatus(
              msg.type === "peer_connected" ? "connected" : "disconnected",
            );
            // Pi connected — cancel the stale timer
            if (msg.type === "peer_connected" && staleTimerRef.current) {
              clearTimeout(staleTimerRef.current);
              staleTimerRef.current = null;
            }
          }
          return; // peer-status messages are not forwarded to the app
        }

        // Session ended — pi started a new session or shut down
        if (msg.type === "session_ended") {
          setSessionEnded(true);
          return; // not forwarded to the app
        }

        // Models list from pi's registry
        if (msg.type === "models_list") {
          const payload = msg.payload as { models: Array<{ id: string; provider: string; name: string }> };
          setAvailableModels(payload.models ?? []);
          return; // not forwarded to the app
        }

        // Skills list from pi's command registry
        if (msg.type === "skills_list") {
          const payload = msg.payload as { skills: Array<{ name: string; description?: string; source: string }> };
          setAvailableSkills(payload.skills ?? []);
          return; // not forwarded to the app
        }

        // sync_response means pi is alive — cancel the stale timer
        if (msg.type === "sync_response" && staleTimerRef.current) {
          clearTimeout(staleTimerRef.current);
          staleTimerRef.current = null;
        }

        onMessageRef.current(msg);
      } catch (e) {
        console.debug("[pi-web-sync] failed to parse message:", e instanceof Error ? e.message : e);
      }
    });

    ws.addEventListener("close", (event) => {
      if (!aliveRef.current) return;
      clearStableTimer();
      stopHeartbeat();

      if (intentionalCloseRef.current) return; // synthetic close from our own reconnect(); ignore

      // Relay rejected us: another tab holds this session. shouldReconnectOnClose
      // already stopped partysocket from retrying; surface a distinct state.
      if (event.code === CLOSE_DUPLICATE_WEB) {
        setState("rejected");
        return;
      }

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
      stopHeartbeat();
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current);
        staleTimerRef.current = null;
      }
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
    stopHeartbeat();
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
    // The heartbeat is restarted by the next "open" event.
  }, [stopHeartbeat]);

  // Keep the heartbeat's reference to reconnect current across renders.
  reconnectRef.current = reconnect;

  return { state, piStatus, sessionEnded, availableModels, availableSkills, retryAttempt, send, reconnect };
}