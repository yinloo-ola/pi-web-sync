/**
 * Wire protocol types and close codes for pi-web-sync.
 *
 * Single source of truth for the relay message contract and WebSocket close
 * codes. The web app and relay import from here as normal workspace
 * dependencies; the extension imports as a type-only dev dependency (types
 * erased at runtime by jiti, so no build step and no runtime dependency —
 * ADR-003 still holds).
 *
 * Transport-liveness helpers (`isOpen`, `OPEN`) stay in the relay package —
 * they are not wire contract.
 */

import type { PiCommand } from "./pi-command";

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Message envelope
// ---------------------------------------------------------------------------

export interface RelayMessage {
  type: MessageType;
  sessionId: string;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Payload interfaces
// ---------------------------------------------------------------------------

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
  /** The typed pi command (discriminated union). */
  command: PiCommand;
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

// ---------------------------------------------------------------------------
// WebSocket close codes (private-use range 4000–4999)
// ---------------------------------------------------------------------------

/** Malformed request: bad session path or missing/invalid `?client=`. */
export const CLOSE_INVALID_REQUEST = 4001;

/** A second *web* client tried to join a session that already has a live one. */
export const CLOSE_DUPLICATE_WEB = 4002;

// Re-export session URL utilities for convenience.
export { buildSessionWsUrl, parseSessionWsPath } from "./session-url";

// Typed pi-command union + parser
export type { PiCommand } from "./pi-command";
export { parsePiCommand } from "./pi-command";