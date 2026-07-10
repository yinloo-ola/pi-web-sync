/** Shared types for the web app. Mirrors extension/types.ts. */

export type MessageType =
  | "user_message"
  | "assistant_delta"
  | "assistant_done"
  | "sync_request"
  | "sync_response";

export interface RelayMessage {
  type: MessageType;
  sessionId: string;
  payload: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}