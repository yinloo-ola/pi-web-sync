import { useCallback, useState } from "react";
import type { ChatMessage } from "../types";

const STORAGE_PREFIX = "pi-web-sync:";

/** Hook that persists chat messages to localStorage. Returns messages and addMessage. */
export function useLocalStorage(sessionId: string): {
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  /** Merge an array of messages, de-duping by id, sorting by timestamp, and persisting. */
  mergeMessages: (msgs: ChatMessage[]) => void;
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

  const mergeMessages = useCallback(
    (incoming: ChatMessage[]) => {
      if (incoming.length === 0) return;
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const additions = incoming.filter((m) => !seen.has(m.id));
        if (additions.length === 0) return prev;
        const next = [...prev, ...additions].sort((a, b) => a.timestamp - b.timestamp);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { messages, addMessage, mergeMessages };
}