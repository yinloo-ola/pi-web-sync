/**
 * Web-app-specific types. Relay types (RelayMessage, MessageType, payloads)
 * live in pi-web-sync-protocol — import from there to avoid drift.
 */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}