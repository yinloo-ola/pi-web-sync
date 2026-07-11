import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RelayClient, type ConnectionState } from "./relay-client";
import type { RelayMessage } from "./types";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The underlying WebSocket partysocket wraps. partysocket reads the constructor
 * from `options.WebSocket`, so we inject this mock there (via RelayClientOptions)
 * instead of stubbing a global. partysocket does `new WS(url)`, sets binaryType,
 * and addEventListener's open/close/message/error.
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
});

afterEach(() => {
  capturedMock = null;
});

/** Flush partysocket's zero-delay initial-connect wait and its .then chain. */
const flushConnect = () => new Promise<void>((r) => setTimeout(r, 20));

function makeClient(): RelayClient {
  return new RelayClient("wss://relay.test", "abc", {
    WebSocket: MockWebSocket as unknown as typeof WebSocket,
  });
}

describe("RelayClient", () => {
  describe("connect", () => {
    it("connects with the pi client path and resolves on open", async () => {
      const client = makeClient();
      const p = client.connect();
      await flushConnect();
      expect(capturedMock!.url).toBe("wss://relay.test/session/abc?client=pi");

      capturedMock!.readyState = 1; // OPEN
      capturedMock!.dispatch("open", { type: "open" });
      await expect(p).resolves.toBeUndefined();

      client.disconnect();
    });

    it("rejects on an initial connection error", async () => {
      const client = makeClient();
      const p = client.connect();
      await flushConnect();
      capturedMock!.dispatch("error", {});
      await expect(p).rejects.toThrow("WebSocket connection failed");
      // The failed attempt must not leave partysocket retrying in the background.
      expect(capturedMock!.close).toHaveBeenCalled();
    });
  });

  describe("send + buffering", () => {
    it("buffers messages while connecting and flushes them on open", async () => {
      const client = makeClient();
      const p = client.connect();
      await flushConnect();
      const ws = capturedMock!;
      expect(ws.readyState).toBe(0); // still CONNECTING

      // Sent while down — must be buffered by partysocket, not silently dropped.
      const msg: RelayMessage = {
        type: "assistant_done",
        sessionId: "abc",
        payload: { text: "hi" },
      };
      client.send(msg);
      expect(ws.send).not.toHaveBeenCalled();

      // On open, partysocket flushes its queue before dispatching open.
      ws.readyState = 1;
      ws.dispatch("open", { type: "open" });
      await p;

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(msg));
      client.disconnect();
    });
  });

  describe("message handling", () => {
    it("forwards non-sync messages, routes sync_request, and drops peer_disconnected", async () => {
      const client = makeClient();
      const onMessage = vi.fn();
      const onSyncRequest = vi.fn();
      client.onMessage(onMessage);
      client.onSyncRequest(onSyncRequest);

      const p = client.connect();
      await flushConnect();
      const ws = capturedMock!;
      ws.readyState = 1;
      ws.dispatch("open", { type: "open" });
      await p;

      const userMsg: RelayMessage = { type: "user_message", sessionId: "abc", payload: { text: "hi" } };
      ws.dispatch("message", { type: "message", data: JSON.stringify(userMsg) });
      expect(onMessage).toHaveBeenCalledWith(userMsg);

      ws.dispatch("message", { type: "message", data: JSON.stringify({ type: "sync_request", sessionId: "abc", payload: {} }) });
      expect(onSyncRequest).toHaveBeenCalled();
      expect(onMessage).toHaveBeenCalledTimes(1); // sync_request not forwarded

      ws.dispatch("message", { type: "message", data: JSON.stringify({ type: "peer_disconnected", sessionId: "abc", payload: { peer: "web" } }) });
      expect(onMessage).toHaveBeenCalledTimes(1); // peer_disconnected not forwarded

      client.disconnect();
    });
  });

  describe("status", () => {
    it("reports connected on open, then reconnecting on a mid-session drop", async () => {
      const client = makeClient();
      const statuses: Array<[ConnectionState, number]> = [];
      client.onStatus((state, attempt) => statuses.push([state, attempt]));

      const p = client.connect();
      await flushConnect();
      const ws = capturedMock!;
      ws.readyState = 1;
      ws.dispatch("open", { type: "open" });
      await p;
      expect(statuses).toContainEqual(["connected", 0]);

      // Simulate an accidental drop (before minUptime resets the counter).
      ws.readyState = 3; // CLOSED
      ws.dispatch("close", { code: 1006 });
      expect(statuses).toContainEqual(["reconnecting", 1]);

      client.disconnect();
    });
  });

  describe("heartbeat", () => {
    it("sends a ping on interval and clears the timeout on receiving a pong", async () => {
      const client = new RelayClient("wss://relay.test", "abc", {
        WebSocket: MockWebSocket as unknown as typeof WebSocket,
        heartbeat: { pingIntervalMs: 100, pongTimeoutMs: 50 },
      });
      const onMsg = vi.fn();
      const statuses: Array<[ConnectionState, number]> = [];
      client.onMessage(onMsg);
      client.onStatus((s, a) => statuses.push([s, a]));

      const p = client.connect();
      await flushConnect();
      const ws = capturedMock!;
      ws.readyState = 1;
      ws.dispatch("open", { type: "open" });
      await p;
      expect(statuses).toContainEqual(["connected", 0]);

      statuses.length = 0;

      // Wait for the first ping (100ms + margin).
      await delay(130);
      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"ping"'),
      );

      // Send pong before the 50ms timeout expires.
      ws.dispatch("message", {
        type: "message",
        data: JSON.stringify({ type: "pong", sessionId: "abc", payload: {} }),
      });

      // Wait past the pong timeout window — should NOT reconnect.
      await delay(80);
      expect(statuses.filter((s) => s[0] === "reconnecting")).toHaveLength(0);

      // Pong should NOT be forwarded to the message handler.
      expect(onMsg).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "pong" }),
      );

      client.disconnect();
    });

    it("reconnects on missed pong (zombie detection)", async () => {
      const client = new RelayClient("wss://relay.test", "abc", {
        WebSocket: MockWebSocket as unknown as typeof WebSocket,
        heartbeat: { pingIntervalMs: 50, pongTimeoutMs: 30 },
      });
      const statuses: Array<[ConnectionState, number]> = [];
      client.onStatus((s, a) => statuses.push([s, a]));

      const p = client.connect();
      await flushConnect();
      const ws = capturedMock!;
      ws.readyState = 1;
      ws.dispatch("open", { type: "open" });
      await p;
      expect(statuses).toContainEqual(["connected", 0]);

      statuses.length = 0;

      // Wait for ping (50ms) + pong timeout (30ms) + margin.
      await delay(120);

      // A missed pong should trigger a reconnect.
      expect(statuses).toContainEqual(["reconnecting", 0]);

      client.disconnect();
    });
  });

  describe("disconnect", () => {
    it("closes the socket", async () => {
      const client = makeClient();
      const p = client.connect();
      await flushConnect();
      capturedMock!.readyState = 1;
      capturedMock!.dispatch("open", { type: "open" });
      await p;

      client.disconnect();
      expect(capturedMock!.close).toHaveBeenCalled();
    });

    it("does not trigger auto-reconnect after deliberate disconnect", async () => {
      const client = makeClient();
      const statuses: Array<[ConnectionState, number]> = [];
      client.onStatus((state, attempt) => statuses.push([state, attempt]));

      const p = client.connect();
      await flushConnect();
      capturedMock!.readyState = 1;
      capturedMock!.dispatch("open", { type: "open" });
      await p;
      expect(statuses).toContainEqual(["connected", 0]);

      // Deliberate disconnect — must NOT trigger a reconnect.
      client.disconnect();
      expect(capturedMock!.close).toHaveBeenCalled();

      // Wait for any pending timers — no "reconnecting" status must appear.
      await delay(100);
      expect(statuses.find((s) => s[0] === "reconnecting")).toBeUndefined();
    });

    it("allows a fresh connect after disconnect", async () => {
      const client = makeClient();
      const p = client.connect();
      await flushConnect();
      capturedMock!.readyState = 1;
      capturedMock!.dispatch("open", { type: "open" });
      await p;

      client.disconnect();
      capturedMock = null;

      // Reconnect after disconnect — must create a new socket.
      const p2 = client.connect();
      await flushConnect();
      expect(capturedMock).not.toBeNull();
      capturedMock!.readyState = 1;
      capturedMock!.dispatch("open", { type: "open" });
      await p2;

      client.disconnect();
    });
  });
});