/** Message envelope for pi ↔ relay ↔ webapp communication. */

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

export interface UserMessagePayload {
  role: "user";
  text: string;
  timestamp: number;
}

export interface AssistantDeltaPayload {
  role: "assistant";
  delta: string;
  timestamp: number;
}

export interface AssistantDonePayload {
  role: "assistant";
  text: string;
  timestamp: number;
}

export interface SyncRequestPayload {
  /** Web app requests full conversation history on connect. */
}

export interface SyncResponsePayload {
  messages: Array<UserMessagePayload | AssistantDonePayload>;
}