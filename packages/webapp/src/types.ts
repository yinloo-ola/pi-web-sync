/**
 * Web-app-specific types. Relay types (RelayMessage, MessageType, payloads)
 * live in packages/extension/types.ts — import from there to avoid drift.
 */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}