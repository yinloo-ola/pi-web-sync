/**
 * Re-exports from the protocol package.
 *
 * The extension takes a type-only dev dependency on `pi-web-sync-protocol`
 * (types erased at runtime by jiti, so no build step — ADR-003 still holds).
 * This file re-exports everything for backward compatibility with existing
 * imports within the extension.
 */
export type {
  MessageType,
  RelayMessage,
  UserMessagePayload,
  AssistantDeltaPayload,
  AssistantDonePayload,
  SyncRequestPayload,
  SyncResponsePayload,
  PeerDisconnectedPayload,
  PiCommandPayload,
  ModelsListPayload,
  SkillsListPayload,
  SessionEndedPayload,
} from "pi-web-sync-protocol";

