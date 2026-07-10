import { useCallback } from "react";
import { Chat } from "./components/Chat";
import { useRelay } from "./hooks/useRelay";
import { useLocalStorage } from "./hooks/useLocalStorage";
import type { ChatMessage, RelayMessage } from "./types";

const DEFAULT_RELAY_URL = "wss://pi-web-sync-relay.example.com";

/** Extract session ID from URL path: /session/<id>. */
function getSessionId(): string {
  const match = window.location.pathname.match(/^\/session\/([a-f0-9]+)$/);
  if (match) return match[1];
  // Fallback: show an error UI instead of crashing
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

  const { messages, addMessage, clearMessages } = useLocalStorage(sessionId);

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

  const { state, send } = useRelay(sessionId, DEFAULT_RELAY_URL, handleMessage);

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
    />
  );
}