import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRelay } from "./useRelay";
import type { RelayMessage } from "pi-web-sync-protocol";

/**
 * Captures the underlying WebSocket that partysocket wraps, so the test can
 * drive connection events. partysocket reads the global `WebSocket` at call
 * time (`options.WebSocket || WebSocket`), so stubbing the global is enough.
 */
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = 0; // CONNECTING
  binaryType = "blob";
  url: string;
  send = vi.fn();
  close = vi.fn();
  private listeners: Record<string, Array<(e: unknown) => void>> = {};

  constructor(url: string) {
    this.url = url;
    capturedMock = this;
  }
  addEventListener(type: string, fn: (e: unknown) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type: string, fn: (e: unknown) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  dispatch(type: string, event: unknown) {
    (this.listeners[type] ?? []).forEach((f) => f(event));
  }
}

let capturedMock: MockWebSocket | null = null;

beforeEach(() => {
  capturedMock = null;
  vi.stubGlobal("WebSocket", MockWebSocket as unknown);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Flush partysocket's zero-delay initial-connect wait and its .then chain. */
const flushConnect = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });

describe("heartbeat", () => {
    it("triggers a reconnect when the pong timeout expires (missed pong = zombie)", async () => {
      vi.useFakeTimers();
      const onMessage = vi.fn();
      const { result, unmount } = renderHook(() =>
        useRelay("s1", "wss://relay.test", onMessage),
      );

      // Advance past partysocket's initial _wait(0) so it creates the socket.
      await act(() => vi.advanceTimersByTimeAsync(20));
      const ws = capturedMock!;
      expect(ws).toBeDefined();

      // Open the connection.
      await act(async () => {
        ws.readyState = 1;
        ws.dispatch("open", { type: "open" });
      });
      expect(result.current.state).toBe("connected");

      // Advance 30s — the ping interval fires, sending a ping and setting a
      // 10s pong timeout.
      await act(() => vi.advanceTimersByTimeAsync(30000));
      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"ping"'),
      );

      // Don't send a pong — advance 10s more to trigger the pong timeout.
      await act(() => vi.advanceTimersByTimeAsync(10000));
      // The heartbeat detects the zombie and calls reconnect, setting state
      // to "connecting".
      expect(result.current.state).toBe("connecting");

      unmount();
      vi.useRealTimers();
    });

    it("does not reconnect when a pong is received within the timeout window", async () => {
      vi.useFakeTimers();
      const onMessage = vi.fn();
      const { result, unmount } = renderHook(() =>
        useRelay("s1", "wss://relay.test", onMessage),
      );

      await act(() => vi.advanceTimersByTimeAsync(20));
      const ws = capturedMock!;

      await act(async () => {
        ws.readyState = 1;
        ws.dispatch("open", { type: "open" });
      });
      expect(result.current.state).toBe("connected");

      // Advance 30s to trigger the ping interval.
      await act(() => vi.advanceTimersByTimeAsync(30000));

      // Send a pong back before the 10s timeout expires.
      await act(async () => {
        ws.dispatch("message", {
          type: "message",
          data: JSON.stringify({
            type: "pong",
            sessionId: "s1",
            payload: {},
          }),
        });
      });

      // Advance 10s more — the pong timeout was cleared, so no reconnect.
      await act(() => vi.advanceTimersByTimeAsync(10000));
      expect(result.current.state).toBe("connected");

      unmount();
      vi.useRealTimers();
    });
  });

  describe("useRelay", () => {
  it("buffers messages while disconnected and flushes them on reconnect", async () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() =>
      useRelay("s1", "wss://relay.test", onMessage),
    );

    // partysocket's first connect attempt waits one tick (delay 0) before
    // creating the underlying socket.
    await flushConnect();
    const ws = capturedMock;
    expect(ws).toBeDefined();
    expect(ws!.readyState).toBe(0); // still CONNECTING — no open yet

    // A send while down must be buffered by partysocket, not silently dropped
    // (the old behavior guarded on readyState and no-op'd).
    const buffered: RelayMessage = {
      type: "user_message",
      sessionId: "s1",
      payload: { text: "hi" },
    };
    await act(async () => {
      result.current.send(buffered);
    });
    expect(ws!.send).not.toHaveBeenCalled(); // not delivered while CONNECTING

    // Connection opens: partysocket flushes its queue (buffered msg first),
    // THEN our open handler sends sync_request.
    await act(async () => {
      ws!.readyState = 1; // OPEN
      ws!.dispatch("open", { type: "open" });
    });

    expect(ws!.send).toHaveBeenCalledWith(JSON.stringify(buffered));
    expect(ws!.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"sync_request"'),
    );
    expect(result.current.state).toBe("connected");

    unmount();
    expect(ws!.close).toHaveBeenCalled(); // deliberate close on teardown
  });

  it("surfaces a relay duplicate-tab reject (close 4002) as 'rejected' without reconnecting", async () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() =>
      useRelay("s1", "wss://relay.test", onMessage),
    );
    await flushConnect();
    const ws = capturedMock!;

    // Connect, then the relay rejects us as a duplicate tab.
    await act(async () => {
      ws.readyState = 1; // OPEN
      ws.dispatch("open", { type: "open" });
    });
    expect(result.current.state).toBe("connected");

    await act(async () => {
      ws.dispatch("close", {
        code: 4002,
        reason: "Session already has an active browser",
      });
    });
    expect(result.current.state).toBe("rejected");

    // shouldReconnectOnClose returned false for 4002, so partysocket must NOT
    // have created a new underlying socket (no reconnect loop against the relay).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(capturedMock).toBe(ws);

    unmount();
  });

  it("forwards sync_response to onMessage (not silently dropped)", async () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() =>
      useRelay("s1", "wss://relay.test", onMessage),
    );

    await flushConnect();
    const ws = capturedMock!;

    await act(async () => {
      ws.readyState = 1;
      ws.dispatch("open", { type: "open" });
    });
    expect(result.current.state).toBe("connected");

    // Relay sends sync_response with conversation history
    const syncResponse: RelayMessage = {
      type: "sync_response",
      sessionId: "s1",
      payload: {
        messages: [
          { role: "user", text: "hello", timestamp: 100 },
          { role: "assistant", text: "hi", timestamp: 200 },
        ],
      },
    };
    await act(async () => {
      ws.dispatch("message", {
        type: "message",
        data: JSON.stringify(syncResponse),
      });
    });

    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "sync_response" }),
    );
    const forwarded = onMessage.mock.calls[0][0] as RelayMessage;
    expect(forwarded.payload.messages).toHaveLength(2);

    unmount();
  });

  describe("session_ended", () => {
    it("sets sessionEnded to true when session_ended message is received", async () => {
      vi.useFakeTimers();
      const onMessage = vi.fn();
      const { result, unmount } = renderHook(() =>
        useRelay("s1", "wss://relay.test", onMessage),
      );

      await act(() => vi.advanceTimersByTimeAsync(20));
      const ws = capturedMock!;

      await act(async () => {
        ws.readyState = 1;
        ws.dispatch("open", { type: "open" });
      });
      expect(result.current.state).toBe("connected");
      expect(result.current.sessionEnded).toBe(false);

      // Receive session_ended message
      await act(async () => {
        ws.dispatch("message", {
          type: "message",
          data: JSON.stringify({
            type: "session_ended",
            sessionId: "s1",
            payload: { reason: "new_session" },
          }),
        });
      });

      expect(result.current.sessionEnded).toBe(true);
      // session_ended is NOT forwarded to onMessage (it's handled internally)
      expect(onMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "session_ended" }),
      );

      unmount();
      vi.useRealTimers();
    });

    it("sets sessionEnded to true when no pi peer connects within 5 seconds (stale URL)", async () => {
      vi.useFakeTimers();
      const onMessage = vi.fn();
      const { result, unmount } = renderHook(() =>
        useRelay("s1", "wss://relay.test", onMessage),
      );

      await act(() => vi.advanceTimersByTimeAsync(20));
      const ws = capturedMock!;

      await act(async () => {
        ws.readyState = 1;
        ws.dispatch("open", { type: "open" });
      });
      expect(result.current.state).toBe("connected");
      expect(result.current.sessionEnded).toBe(false);

      // No peer_connected message arrives — advance 5 seconds
      await act(() => vi.advanceTimersByTimeAsync(5000));

      expect(result.current.sessionEnded).toBe(true);

      unmount();
      vi.useRealTimers();
    });

    it("does NOT set sessionEnded if pi peer connects within 5 seconds", async () => {
      vi.useFakeTimers();
      const onMessage = vi.fn();
      const { result, unmount } = renderHook(() =>
        useRelay("s1", "wss://relay.test", onMessage),
      );

      await act(() => vi.advanceTimersByTimeAsync(20));
      const ws = capturedMock!;

      await act(async () => {
        ws.readyState = 1;
        ws.dispatch("open", { type: "open" });
      });
      expect(result.current.state).toBe("connected");

      // Pi peer connects within 5 seconds
      await act(async () => {
        ws.dispatch("message", {
          type: "message",
          data: JSON.stringify({
            type: "peer_connected",
            sessionId: "s1",
            payload: { peer: "pi" },
          }),
        });
      });

      expect(result.current.piStatus).toBe("connected");

      // Advance past 5 seconds — sessionEnded should still be false
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(result.current.sessionEnded).toBe(false);

      unmount();
      vi.useRealTimers();
    });

    it("does NOT set sessionEnded if sync_response arrives within 5 seconds", async () => {
      vi.useFakeTimers();
      const onMessage = vi.fn();
      const { result, unmount } = renderHook(() =>
        useRelay("s1", "wss://relay.test", onMessage),
      );

      await act(() => vi.advanceTimersByTimeAsync(20));
      const ws = capturedMock!;

      await act(async () => {
        ws.readyState = 1;
        ws.dispatch("open", { type: "open" });
      });
      expect(result.current.state).toBe("connected");

      // sync_response arrives within 5 seconds (pi is alive)
      await act(async () => {
        ws.dispatch("message", {
          type: "message",
          data: JSON.stringify({
            type: "sync_response",
            sessionId: "s1",
            payload: { messages: [] },
          }),
        });
      });

      // Advance past 5 seconds — sessionEnded should still be false
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(result.current.sessionEnded).toBe(false);

      unmount();
      vi.useRealTimers();
    });
  });
});