import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocket as WsClient, type WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import { createRelay } from "./relay-server";
import {
  CLOSE_DUPLICATE_WEB,
  CLOSE_INVALID_REQUEST,
  isOpen,
} from "./close-codes";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** `wss.address()` throws until the server is listening; poll briefly. */
function waitForPort(wss: WebSocketServer): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      try {
        const addr = wss.address();
        resolve(typeof addr === "string" ? 0 : (addr as AddressInfo).port);
      } catch {
        if (Date.now() - start > 1000) reject(new Error("relay not listening"));
        else setTimeout(tick, 5);
      }
    };
    tick();
  });
}

describe("close-codes", () => {
  it("isOpen reports OPEN readyState only", () => {
    expect(isOpen({ readyState: 1 })).toBe(true);
    expect(isOpen({ readyState: 0 })).toBe(false);
    expect(isOpen({ readyState: 2 })).toBe(false);
    expect(isOpen({ readyState: 3 })).toBe(false);
    expect(isOpen(null)).toBe(false);
    expect(isOpen(undefined)).toBe(false);
  });
});

describe("heartbeat", () => {
  let relay: ReturnType<typeof createRelay>;
  let port: number;
  const sockets: WsClient[] = [];

  function dial(path: string): Promise<WsClient> {
    return new Promise((resolve, reject) => {
      const ws = new WsClient(`ws://localhost:${port}${path}`);
      sockets.push(ws);
      ws.once("open", () => resolve(ws));
      ws.once("error", reject);
    });
  }

  beforeEach(async () => {
    relay = createRelay(0);
    port = await waitForPort(relay.wss);
  });

  afterEach(async () => {
    for (const s of sockets) {
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
    sockets.length = 0;
    await new Promise<void>((r) => relay.wss.close(() => r()));
  });

  it("relay answers ping with pong and does not forward ping or pong to the peer", async () => {
    const web = await dial("/session/s1?client=web");
    const pi = await dial("/session/s1?client=pi");

    const webMsg: string[] = [];
    const piMsg: string[] = [];
    web.on("message", (data) => webMsg.push(data.toString()));
    pi.on("message", (data) => piMsg.push(data.toString()));

    // Let any buffered handshake messages (peer_connected) drain.
    await delay(20);
    // Discard handshake messages for the heartbeat assertions below.
    webMsg.length = 0;
    piMsg.length = 0;

    const ping = JSON.stringify({ type: "ping", sessionId: "s1", payload: {} });

    // Web sends ping → should receive a pong; pi receives nothing.
    web.send(ping);
    await delay(100);

    const webMsgJson = webMsg.map((m) => JSON.parse(m));
    expect(webMsgJson).toEqual([
      { type: "pong", sessionId: "s1", payload: {} },
    ]);
    const pong = webMsgJson[0];
    expect(pong.type).toBe("pong");
    expect(pong.sessionId).toBe("s1");

    // ping was NOT forwarded to the peer.
    expect(piMsg.length).toBe(0);

    // Reverse direction: pi pings → receives pong; web receives nothing.
    webMsg.length = 0;
    piMsg.length = 0;

    pi.send(ping);
    await delay(100);

    expect(piMsg.length).toBe(1);
    const pong2 = JSON.parse(piMsg[0]);
    expect(pong2.type).toBe("pong");
    expect(pong2.sessionId).toBe("s1");

    expect(webMsg.length).toBe(0);
  });
});

describe("relay single-browser-tab policy", () => {
  let relay: ReturnType<typeof createRelay>;
  let port: number;
  const sockets: WsClient[] = [];

  function dial(path: string): Promise<WsClient> {
    return new Promise((resolve, reject) => {
      const ws = new WsClient(`ws://localhost:${port}${path}`);
      sockets.push(ws);
      ws.once("open", () => resolve(ws));
      ws.once("error", reject);
    });
  }

  function dialExpectingClose(path: string): Promise<{
    code: number;
    reason: string;
  }> {
    return new Promise((resolve) => {
      const ws = new WsClient(`ws://localhost:${port}${path}`);
      sockets.push(ws);
      ws.once("close", (code: number, reason: Buffer) =>
        resolve({ code, reason: reason.toString() }),
      );
    });
  }

  beforeEach(async () => {
    relay = createRelay(0);
    port = await waitForPort(relay.wss);
  });

  afterEach(async () => {
    for (const s of sockets) {
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
    sockets.length = 0;
    await new Promise<void>((r) => relay.wss.close(() => r()));
  });

  it("rejects a second web client with CLOSE_DUPLICATE_WEB while the first is active", async () => {
    const first = await dial("/session/s1?client=web");
    expect(first.readyState).toBe(WsClient.OPEN);

    const { code, reason } = await dialExpectingClose(
      "/session/s1?client=web",
    );
    expect(code).toBe(CLOSE_DUPLICATE_WEB);
    expect(reason).toContain("already");

    // The first tab is unaffected.
    expect(first.readyState).toBe(WsClient.OPEN);
  });

  it("accepts a new web client once the previous one has closed", async () => {
    const first = await dial("/session/s1?client=web");
    first.close();
    await new Promise<void>((r) => first.once("close", () => r()));
    await delay(30); // let the relay null out the stale slot

    const second = await dial("/session/s1?client=web");
    expect(second.readyState).toBe(WsClient.OPEN);
  });

  it("allows pi to replace pi (only web is capped at one)", async () => {
    await dial("/session/s1?client=pi");
    await dial("/session/s1?client=web");

    const secondPi = await dial("/session/s1?client=pi");
    expect(secondPi.readyState).toBe(WsClient.OPEN);
  });

  it("allows one web and one pi in the same session", async () => {
    const web = await dial("/session/s1?client=web");
    const pi = await dial("/session/s1?client=pi");
    expect(web.readyState).toBe(WsClient.OPEN);
    expect(pi.readyState).toBe(WsClient.OPEN);
  });

  it("still rejects an invalid path with CLOSE_INVALID_REQUEST", async () => {
    const { code } = await dialExpectingClose("/bogus?client=web");
    expect(code).toBe(CLOSE_INVALID_REQUEST);
  });
});