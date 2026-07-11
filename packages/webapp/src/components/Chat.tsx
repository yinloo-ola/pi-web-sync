import { useRef, useState, useEffect } from "react";
import type { ChatMessage } from "../types";
import { MessageBubble } from "./MessageBubble";
import type { RelayState } from "../hooks/useRelay";
import type { PiStatus } from "../hooks/useRelay";

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  connectionState: RelayState;
  /** Reconnect attempt (1-based) while `connectionState === "reconnecting"`. */
  retryAttempt: number;
  piStatus: PiStatus;
  onReconnect: () => void;
}

interface StatusDisplay {
  text: string;
  color: string;
}

/** Relay status label/color for the static states. "reconnecting" is dynamic —
 * computed inline with `retryAttempt`. */
const RELAY_STATUS: Record<Exclude<RelayState, "reconnecting">, StatusDisplay> = {
  connecting: { text: "Connecting…", color: "#FF9500" },
  connected: { text: "Connected", color: "#34C759" },
  failed: { text: "Connection failed", color: "#FF3B30" },
  rejected: { text: "Rejected", color: "#FF3B30" },
};

const PI_STATUS: Record<PiStatus, StatusDisplay> = {
  connected: { text: "Pi Connected", color: "#34C759" },
  disconnected: { text: "Pi Disconnected", color: "#FF3B30" },
  unknown: { text: "Pi Status Unknown", color: "#FF9500" },
};

/** Main chat UI: message list, input box, connection status. */
export function Chat({
  messages,
  onSendMessage,
  connectionState,
  retryAttempt,
  piStatus,
  onReconnect,
}: ChatProps) {
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const piStatusLabel = PI_STATUS[piStatus];
  const canSend = connectionState === "connected" && piStatus !== "disconnected";

  const relayStatus: StatusDisplay =
    connectionState === "reconnecting"
      ? {
          text: `Reconnecting… (attempt ${retryAttempt})`,
          color: "#FF9500",
        }
      : RELAY_STATUS[connectionState];

  const banner =
    connectionState === "failed"
      ? { message: "Couldn't reach the relay after several tries.", action: "Reconnect" }
      : connectionState === "rejected"
        ? { message: "This session is already open in another tab.", action: "Try again" }
        : null;

  // Auto-scroll on new messages
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSendMessage(text);
    setInput("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #E5E5EA",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: relayStatus.color,
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 13, color: "#8E8E93" }}>Relay: {relayStatus.text}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: piStatusLabel.color,
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 13, color: "#8E8E93" }}>{piStatusLabel.text}</span>
        </div>
      </div>

      {/* Connection-failed / duplicate-tab banner with a manual action */}
      {banner && (
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid #E5E5EA",
            backgroundColor: "#FFF3F2",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 14, color: "#FF3B30" }}>{banner.message}</span>
          <button
            type="button"
            onClick={onReconnect}
            style={{
              padding: "8px 16px",
              borderRadius: 16,
              border: "1px solid #FF3B30",
              backgroundColor: "white",
              color: "#FF3B30",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {banner.action}
          </button>
        </div>
      )}

      {/* Message list */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
        }}
      >
        {messages.length === 0 && (
          <p style={{ textAlign: "center", color: "#8E8E93", marginTop: 40 }}>
            No messages yet. Type <code>/web-sync connect</code> in pi, then start typing.
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: 8,
          padding: "12px 20px",
          borderTop: "1px solid #E5E5EA",
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={canSend ? "Type a message…" : "Waiting for relay connection…"}
          disabled={!canSend}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 20,
            border: "1px solid #E5E5EA",
            fontSize: 16,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || !canSend}
          style={{
            padding: "10px 20px",
            borderRadius: 20,
            border: "none",
            backgroundColor: "#007AFF",
            color: "white",
            fontSize: 16,
            cursor: "pointer",
            opacity: !input.trim() || !canSend ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}