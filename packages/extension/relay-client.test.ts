import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RelayClient } from "./relay-client";
import type { RelayMessage } from "./types";

// Track the most recent WebSocket instance for assertions
let lastWsUrl = "";
let lastWsHandlers: Record<string, (...args: unknown[]) => void> = {};
let lastWsSend = vi.fn();
let lastWsClose = vi.fn();

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.OPEN;
  url: string;
  close = vi.fn();
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    lastWsUrl = url;
    lastWsHandlers = {};
    lastWsSend = vi.fn();
    lastWsClose = vi.fn();
    this.send = lastWsSend;
    this.close = lastWsClose;
  }

  addEventListener(event: string, handler: (...args: unknown[]) => void) {
    lastWsHandlers[event] = handler;
  }
}

beforeEach(() => {
  lastWsUrl = "";
  lastWsHandlers = {};
  lastWsSend = vi.fn();
  lastWsClose = vi.fn();
  vi.stubGlobal("WebSocket", MockWebSocket as unknown);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function triggerOpen() {
  lastWsHandlers["open"]?.();
}

function triggerMessage(data: string) {
  lastWsHandlers["message"]?.({ data });
}

function triggerError() {
  lastWsHandlers["error"]?.();
}

describe("RelayClient", () => {
  describe("connect", () => {
    it("connects to the relay URL with sessionId as query param [current behavior]", async () => {
      const client = new RelayClient("wss://relay.test", "abc123");
      const connectPromise = client.connect();

      expect(lastWsUrl).toBe("wss://relay.test?sessionId=abc123");

      triggerOpen();
      await connectPromise;
    });

    it("resolves when WebSocket opens", async () => {
      const client = new RelayClient("wss://relay.test", "abc123");
      const connectPromise = client.connect();
      triggerOpen();
      await expect(connectPromise).resolves.toBeUndefined();
    });

    it("rejects when WebSocket errors", async () => {
      const client = new RelayClient("wss://relay.test", "abc123");
      const connectPromise = client.connect();
      triggerError();
      await expect(connectPromise).rejects.toThrow("WebSocket connection failed");
    });
  });

  describe("send", () => {
    it("sends JSON-serialized message over WebSocket", async () => {
      const client = new RelayClient("wss://relay.test", "abc123");
      const connectPromise = client.connect();
      triggerOpen();
      await connectPromise;

      const msg: RelayMessage = {
        type: "user_message",
        sessionId: "abc123",
        payload: { text: "hello" },
      };
      client.send(msg);

      expect(lastWsSend).toHaveBeenCalledWith(JSON.stringify(msg));
    });

    it("does nothing if WebSocket is not open", () => {
      const client = new RelayClient("wss://relay.test", "abc123");
      client.send({
        type: "user_message",
        sessionId: "abc123",
        payload: { text: "hello" },
      });

      expect(lastWsSend).not.toHaveBeenCalled();
    });
  });

  describe("onMessage", () => {
    it("calls handler for non-sync messages", async () => {
      const client = new RelayClient("wss://relay.test", "abc123");
      const handler = vi.fn();
      client.onMessage(handler);

      const connectPromise = client.connect();
      triggerOpen();
      await connectPromise;

      const msg: RelayMessage = { type: "user_message", sessionId: "abc123", payload: { text: "hi" } };
      triggerMessage(JSON.stringify(msg));

      expect(handler).toHaveBeenCalledWith(msg);
    });

    it("calls syncRequestHandler for sync_request messages", async () => {
      const client = new RelayClient("wss://relay.test", "abc123");
      const syncHandler = vi.fn();
      client.onSyncRequest(syncHandler);

      const connectPromise = client.connect();
      triggerOpen();
      await connectPromise;

      const msg: RelayMessage = { type: "sync_request", sessionId: "abc123", payload: {} };
      triggerMessage(JSON.stringify(msg));

      expect(syncHandler).toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    it("closes the WebSocket", async () => {
      const client = new RelayClient("wss://relay.test", "abc123");
      const connectPromise = client.connect();
      triggerOpen();
      await connectPromise;

      client.disconnect();
      expect(lastWsClose).toHaveBeenCalled();
    });
  });
});