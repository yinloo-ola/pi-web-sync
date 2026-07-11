import { useCallback } from "react";
import { Chat } from "./components/Chat";
import { useRelay } from "./hooks/useRelay";
import { useLocalStorage } from "./hooks/useLocalStorage";
import type { ChatMessage } from "./types";
import type { RelayMessage } from "../../extension/types";

const RELAY_URL = import.meta.env.VITE_RELAY_URL;

if (!RELAY_URL) {
  console.warn("[pi-web-sync] VITE_RELAY_URL not set — web app will not connect to relay");
}

/** Extract session ID from URL path: /session/<id>. */
function getSessionId(): string {
  const match = window.location.pathname.match(/^\/session\/([^/]+)$/);
  if (match) return match[1];
  return "";
}

/** Root app: extracts session ID from URL, connects to relay, renders Chat. */
export default function App() {
  const sessionId = getSessionId();

  // Fallback when no session ID is found
  if (!sessionId) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h1>pi-web-sync</h1>
        <p>No session ID found in URL.</p>
        <p>Use <code>/session/&lt;your-session-id&gt;</code>.</p>
      </div>
    );
  }

  const { messages, addMessage } = useLocalStorage(sessionId);

  const handleMessage = useCallback(
    (msg: RelayMessage) => {
      if (msg.type === "user_message") {
        const payload = msg.payload as { text: string; timestamp: number };
        addMessage({
          id: `${msg.sessionId}-${payload.timestamp}`,
          role: "user",
          text: payload.text,
          timestamp: payload.timestamp,
        });
      } else if (msg.type === "assistant_delta") {
        // Deltas are accumulated into done messages — skip for now
      } else if (msg.type === "assistant_done") {
        const payload = msg.payload as { text: string; timestamp: number };
        addMessage({
          id: `${msg.sessionId}-${payload.timestamp}`,
          role: "assistant",
          text: payload.text,
          timestamp: payload.timestamp,
        });
      }
    },
    [addMessage],
  );

  const { state, piStatus, retryAttempt, send, reconnect } = useRelay(
    sessionId,
    RELAY_URL,
    handleMessage,
  );

  const handleSend = useCallback(
    (text: string) => {
      addMessage({
        id: `${sessionId}-${Date.now()}`,
        role: "user",
        text,
        timestamp: Date.now(),
      });
      send({
        type: "user_message",
        sessionId,
        payload: { role: "user", text, timestamp: Date.now() },
      });
    },
    [sessionId, send, addMessage],
  );

  return (
    <Chat
      messages={messages}
      onSendMessage={handleSend}
      connectionState={state}
      retryAttempt={retryAttempt}
      piStatus={piStatus}
      onReconnect={reconnect}
    />
  );
}