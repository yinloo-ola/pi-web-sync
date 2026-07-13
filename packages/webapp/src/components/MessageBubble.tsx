import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../types";

/** A single message bubble with markdown rendering. */
export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: "12px",
      }}
    >
      <div
        className="message-bubble"
        style={{
          padding: "12px 16px",
          borderRadius: "12px",
          backgroundColor: isUser ? "#007AFF" : "#E5E5EA",
          color: isUser ? "white" : "black",
          overflowWrap: "break-word",
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
      </div>
    </div>
  );
}