import { useRef, useState, useEffect } from "react";
import type { ChatMessage } from "../types";
import { MessageBubble } from "./MessageBubble";
import type { RelayState } from "../hooks/useRelay";

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  connectionState: RelayState;
}

const STATUS_LABELS: Record<RelayState, { text: string; color: string }> = {
  connecting: { text: "Connecting…", color: "#FF9500" },
  connected: { text: "Connected", color: "#34C759" },
  disconnected: { text: "Disconnected", color: "#FF3B30" },
  error: { text: "Error", color: "#FF3B30" },
};

/** Main chat UI: message list, input box, connection status. */
export function Chat({ messages, onSendMessage, connectionState }: ChatProps) {
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const status = STATUS_LABELS[connectionState];

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
          gap: 8,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: status.color,
            display: "inline-block",
          }}
        />
        <span style={{ fontSize: 14, color: "#8E8E93" }}>{status.text}</span>
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
            No messages yet. Start typing in pi or below.
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
          placeholder="Type a message…"
          disabled={connectionState !== "connected"}
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
          disabled={!input.trim() || connectionState !== "connected"}
          style={{
            padding: "10px 20px",
            borderRadius: 20,
            border: "none",
            backgroundColor: "#007AFF",
            color: "white",
            fontSize: 16,
            cursor: "pointer",
            opacity: !input.trim() || connectionState !== "connected" ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}