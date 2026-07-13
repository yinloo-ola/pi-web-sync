/**
 * Single source of truth for relay wire types.
 * Both the extension and the web app import from here — do not duplicate.
 */

export type MessageType =
  | "user_message"
  | "assistant_delta"
  | "assistant_done"
  | "sync_request"
  | "sync_response"
  | "peer_connected"
  | "peer_disconnected"
  | "ping"
  | "pong"
  | "pi_command"
  | "models_list"
  | "skills_list"
  | "session_ended";

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

export interface PeerDisconnectedPayload {
  peer: "pi" | "web";
}

export interface PiCommandPayload {
  /** The full command string (e.g., "model anthropic/claude-sonnet-4-5", "skill:research", "compact"). */
  command: string;
}

export interface ModelsListPayload {
  /** Available models from pi's registry. */
  models: Array<{ id: string; provider: string; name: string }>;
}

export interface SkillsListPayload {
  /** Available skills from pi's command registry. */
  skills: Array<{ name: string; description?: string; source: string }>;
}

export interface SessionEndedPayload {
  /** Why the session ended. */
  reason: "new_session" | "shutdown";
}