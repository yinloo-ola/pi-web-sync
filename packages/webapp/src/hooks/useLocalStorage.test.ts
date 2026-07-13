import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorage } from "./useLocalStorage";
import type { ChatMessage } from "../types";

describe("useLocalStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function makeMsg(
    id: string,
    role: "user" | "assistant",
    text: string,
    timestamp: number,
  ): ChatMessage {
    return { id, role, text, timestamp };
  }

  describe("mergeMessages", () => {
    it("merges incoming messages with de-dup by id and sorts by timestamp", () => {
      const { result } = renderHook(() => useLocalStorage("s1"));

      // Seed with two existing messages
      act(() => {
        result.current.addMessage(makeMsg("s1-100", "user", "hello", 100));
      });
      act(() => {
        result.current.addMessage(makeMsg("s1-300", "assistant", "hi there", 300));
      });
      expect(result.current.messages).toHaveLength(2);

      // Merge: one duplicate (s1-100), two new (out of order)
      act(() => {
        result.current.mergeMessages([
          makeMsg("s1-500", "assistant", "later", 500),
          makeMsg("s1-100", "user", "hello (dup)", 100), // duplicate id
          makeMsg("s1-200", "user", "middle", 200),
        ]);
      });

      const msgs = result.current.messages;
      expect(msgs).toHaveLength(4);
      // Sorted by timestamp
      expect(msgs.map((m) => m.timestamp)).toEqual([100, 200, 300, 500]);
      // Original content preserved for dup (not overwritten)
      expect(msgs[0].text).toBe("hello");
    });

    it("populates from empty localStorage (fresh browser open)", () => {
      const { result } = renderHook(() => useLocalStorage("s1"));
      expect(result.current.messages).toHaveLength(0);

      act(() => {
        result.current.mergeMessages([
          makeMsg("s1-100", "user", "first", 100),
          makeMsg("s1-200", "assistant", "reply", 200),
        ]);
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages.map((m) => m.timestamp)).toEqual([100, 200]);
    });

    it("persists merged messages to localStorage", () => {
      const { result } = renderHook(() => useLocalStorage("s1"));

      act(() => {
        result.current.mergeMessages([
          makeMsg("s1-100", "user", "persisted", 100),
        ]);
      });

      const stored = JSON.parse(
        localStorage.getItem("pi-web-sync:s1")!,
      );
      expect(stored).toHaveLength(1);
      expect(stored[0].text).toBe("persisted");
    });

    it("no-op on empty incoming array", () => {
      const { result } = renderHook(() => useLocalStorage("s1"));
      act(() => {
        result.current.addMessage(makeMsg("s1-100", "user", "hello", 100));
      });

      act(() => {
        result.current.mergeMessages([]);
      });

      expect(result.current.messages).toHaveLength(1);
    });

    it("no-op when all incoming are duplicates", () => {
      const { result } = renderHook(() => useLocalStorage("s1"));
      act(() => {
        result.current.addMessage(makeMsg("s1-100", "user", "hello", 100));
      });

      act(() => {
        result.current.mergeMessages([
          makeMsg("s1-100", "user", "hello", 100),
        ]);
      });

      expect(result.current.messages).toHaveLength(1);
    });
  });

  describe("clearMessages", () => {
    it("clears all messages from state and localStorage", () => {
      const { result } = renderHook(() => useLocalStorage("s1"));

      act(() => {
        result.current.addMessage(makeMsg("s1-100", "user", "hello", 100));
      });
      act(() => {
        result.current.addMessage(makeMsg("s1-200", "assistant", "hi", 200));
      });
      expect(result.current.messages).toHaveLength(2);

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages).toHaveLength(0);
      expect(localStorage.getItem("pi-web-sync:s1")).toBeNull();
    });
  });

  describe("TTL expiry", () => {
    it("clears messages older than 1 week on load", () => {
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
      const oldTimestamp = Date.now() - oneWeekMs - 1000;

      // Seed localStorage with old messages
      localStorage.setItem(
        "pi-web-sync:s1",
        JSON.stringify([makeMsg("s1-100", "user", "old message", oldTimestamp)]),
      );

      const { result } = renderHook(() => useLocalStorage("s1"));

      // Messages should be cleared due to TTL
      expect(result.current.messages).toHaveLength(0);
      expect(localStorage.getItem("pi-web-sync:s1")).toBeNull();
    });

    it("keeps messages younger than 1 week", () => {
      const recentTimestamp = Date.now() - 1000; // 1 second ago

      localStorage.setItem(
        "pi-web-sync:s1",
        JSON.stringify([makeMsg("s1-100", "user", "recent message", recentTimestamp)]),
      );

      const { result } = renderHook(() => useLocalStorage("s1"));

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].text).toBe("recent message");
    });

    it("keeps empty localStorage as empty", () => {
      const { result } = renderHook(() => useLocalStorage("s1"));
      expect(result.current.messages).toHaveLength(0);
    });
  });
});
