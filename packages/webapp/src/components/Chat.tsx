import { useRef, useState, useEffect } from "react";
import type { ChatMessage } from "../types";
import { MessageBubble } from "./MessageBubble";
import type { RelayState } from "../hooks/useRelay";
import type { PiStatus } from "../hooks/useRelay";

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  connectionState: RelayState;
  piStatus: PiStatus;
}

const RELAY_STATUS_LABELS: Record<RelayState, { text: string; color: string }> = {
  connecting: { text: "Connecting…", color: "#FF9500" },
  connected: { text: "Connected", color: "#34C759" },
  disconnected: { text: "Disconnected", color: "#FF3B30" },
  error: { text: "Error", color: "#FF3B30" },
};

const PI_STATUS_LABELS: Record<PiStatus, { text: string; color: string }> = {
  connected: { text: "Pi Connected", color: "#34C759" },
  disconnected: { text: "Pi Disconnected", color: "#FF3B30" },
  unknown: { text: "Pi Status Unknown", color: "#FF9500" },
};

/** Main chat UI: message list, input box, connection status. */
export function Chat({ messages, onSendMessage, connectionState, piStatus }: ChatProps) {
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const relayStatus = RELAY_STATUS_LABELS[connectionState];
  const piStatusLabel = PI_STATUS_LABELS[piStatus];
  const canSend = connectionState === "connected" && piStatus !== "disconnected";

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