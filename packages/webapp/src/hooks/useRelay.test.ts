import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRelay } from "./useRelay";
import type { RelayMessage } from "../types";

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
});