import { useRef, useState, useEffect, useCallback } from "react";
import type { ChatMessage } from "../types";
import { MessageBubble } from "./MessageBubble";
import { SlashMenu } from "./SlashMenu";
import type { RelayState, PiStatus, ModelInfo, SkillInfo, PromptInfo } from "../hooks/useRelay";

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onSendCommand: (command: string) => void;
  onClearChat: () => void;
  connectionState: RelayState;
  /** Reconnect attempt (1-based) while `connectionState === “reconnecting”`. */
  retryAttempt: number;
  piStatus: PiStatus;
  /** Whether the session has ended (pi started new session or no pi peer within 5s). */
  sessionEnded: boolean;
  /** Available models from pi's registry. */
  availableModels: ModelInfo[];
  /** Available skills from pi's command registry. */
  availableSkills: SkillInfo[];
  /** Available prompt templates from pi. */
  availablePrompts: PromptInfo[];
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
  onSendCommand,
  onClearChat,
  connectionState,
  retryAttempt,
  piStatus,
  sessionEnded,
  availableModels,
  availableSkills,
  availablePrompts,
  onReconnect,
}: ChatProps) {
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const piStatusLabel = PI_STATUS[piStatus];
  const canSend = connectionState === "connected" && piStatus !== "disconnected" && !sessionEnded;
  const showSlashMenu = canSend && input.startsWith("/");

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

  const handleSlashSelect = useCallback(
    (command: string) => {
      onSendCommand(command);
      setInput("");
      inputRef.current?.focus();
    },
    [onSendCommand],
  );

  const handleFillInput = useCallback(
    (value: string) => {
      setInput(value);
      inputRef.current?.focus();
    },
    [],
  );

  const handleSlashDismiss = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    // If input starts with /, treat it as a command (send full command string)
    if (text.startsWith("/")) {
      const cmd = text.slice(1); // Remove leading /
      if (cmd) {
        onSendCommand(cmd);
        setInput("");
        return;
      }
    }
    onSendMessage(text);
    setInput("");
  }

  return (
    <div className="chat-container" style={{ display: "flex", flexDirection: "column", height: "100vh", margin: "0 auto" }}>
      {/* Header */}
      <div
        className="chat-header"
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
        {messages.length > 0 && (
          <button
            type="button"
            onClick={onClearChat}
            style={{
              marginLeft: "auto",
              padding: "4px 12px",
              borderRadius: 12,
              border: "1px solid #E5E5EA",
              backgroundColor: "white",
              color: "#8E8E93",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Clear chat
          </button>
        )}
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

      {/* Session ended banner */}
      {sessionEnded && (
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid #E5E5EA",
            backgroundColor: "#FFF9E6",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 14, color: "#8E6B00" }}>
            Session ended — run <code>/web-sync qr</code> in pi to get a new link
          </span>
        </div>
      )}

      {/* Message list */}
      <div
        ref={listRef}
        className="chat-messages"
        style={{
          flex: 1,
          overflowY: "auto",
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
      <div
        className="chat-input"
        style={{
          position: "relative",
          borderTop: "1px solid #E5E5EA",
        }}
      >
        {showSlashMenu && (
          <SlashMenu
            input={input}
            availableModels={availableModels}
            availableSkills={availableSkills}
            availablePrompts={availablePrompts}
            onSelect={handleSlashSelect}
            onFillInput={handleFillInput}
            onDismiss={handleSlashDismiss}
          />
        )}
        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            gap: 8,
            padding: "12px 16px",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={canSend ? "Type a message… (or / for commands)" : "Waiting for relay connection…"}
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
    </div>
  );
}