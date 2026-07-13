import { useCallback, useEffect, useRef } from "react";
import { Chat } from "./components/Chat";
import { useRelay } from "./hooks/useRelay";
import { useLocalStorage } from "./hooks/useLocalStorage";
import type { ChatMessage } from "./types";
import type { RelayMessage } from "pi-web-sync-protocol";
import { parsePiCommand } from "pi-web-sync-protocol";

const RELAY_URL = new URLSearchParams(window.location.search).get("relay") ?? "";

/** Extract session ID from URL path: /session/<id>. */
function getSessionId(): string {
  const match = window.location.pathname.match(/^\/session\/([^/]+)$/);
  if (match) return match[1];
  return "";
}

/** Root app: extracts session ID from URL, connects to relay, renders Chat. */
export default function App() {
  const sessionId = getSessionId();

  // Fallback when no session ID or relay URL is found
  if (!sessionId || !RELAY_URL) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h1>pi-web-sync</h1>
        {!sessionId && <p>No session ID found in URL.</p>}
        {!RELAY_URL && <p>No relay configured. Open a share link from pi.</p>}
      </div>
    );
  }

  const { messages, addMessage, mergeMessages, clearMessages } = useLocalStorage(sessionId);

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
      } else if (msg.type === "sync_response") {
        const { messages: history } = msg.payload as {
          messages: Array<{ role: "user" | "assistant"; text: string; timestamp: number }>;
        };
        mergeMessages(
          history.map((m) => ({
            id: `${msg.sessionId}-${m.timestamp}`,
            role: m.role,
            text: m.text,
            timestamp: m.timestamp,
          })),
        );
      }
    },
    [addMessage, mergeMessages],
  );

  const { state, piStatus, sessionEnded, availableModels, availableSkills, retryAttempt, send, reconnect } = useRelay(
    sessionId,
    RELAY_URL,
    handleMessage,
  );

  // Clear localStorage when session ends
  const prevSessionEnded = useRef(sessionEnded);
  useEffect(() => {
    if (sessionEnded && !prevSessionEnded.current) {
      clearMessages();
    }
    prevSessionEnded.current = sessionEnded;
  }, [sessionEnded, clearMessages]);

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

  const handleSendCommand = useCallback(
    (command: string) => {
      const parsed = parsePiCommand(command);
      if (!parsed) {
        // Unparseable — send as an ordinary user message (the extension's
        // previous else-branch would have done sendUserMessage("/<command>")).
        const text = `/${command}`;
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
        return;
      }

      // Show the command as a user message for visibility
      const text = `/${command}`;
      addMessage({
        id: `${sessionId}-${Date.now()}`,
        role: "user",
        text,
        timestamp: Date.now(),
      });
      // Send typed PiCommand as pi_command payload
      send({
        type: "pi_command",
        sessionId,
        payload: { command: parsed },
      });
    },
    [sessionId, send, addMessage],
  );

  return (
    <Chat
      messages={messages}
      onSendMessage={handleSend}
      onSendCommand={handleSendCommand}
      onClearChat={clearMessages}
      connectionState={state}
      retryAttempt={retryAttempt}
      piStatus={piStatus}
      sessionEnded={sessionEnded}
      availableModels={availableModels}
      availableSkills={availableSkills}
      onReconnect={reconnect}
    />
  );
}