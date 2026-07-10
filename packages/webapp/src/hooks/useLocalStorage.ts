import { stub } from "../../../_ptk/stub";
import type { ChatMessage } from "../types";

/** Hook that persists chat messages to localStorage. Returns messages, addMessage, and clearMessages. */
export function useLocalStorage(sessionId: string): {
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
} {
  return stub("webapp.useLocalStorage");
}