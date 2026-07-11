import { useCallback, useState } from "react";
import type { ChatMessage } from "../types";

const STORAGE_PREFIX = "pi-web-sync:";

/** Hook that persists chat messages to localStorage. Returns messages and addMessage. */
export function useLocalStorage(sessionId: string): {
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
} {
  const key = `${STORAGE_PREFIX}${sessionId}`;

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as ChatMessage[]) : [];
    } catch {
      return [];
    }
  });

  const persist = useCallback(
    (msgs: ChatMessage[]) => {
      try {
        localStorage.setItem(key, JSON.stringify(msgs));
      } catch {
        // localStorage full or unavailable — silently skip
      }
    },
    [key],
  );

  const addMessage = useCallback(
    (msg: ChatMessage) => {
      setMessages((prev) => {
        const next = [...prev, msg];
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { messages, addMessage };
}