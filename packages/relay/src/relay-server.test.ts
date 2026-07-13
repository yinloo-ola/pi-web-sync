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

describe("message forwarding", () => {
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

  function dialWithCapture(path: string): Promise<[WsClient, string[]]> {
    return new Promise((resolve, reject) => {
      const msgs: string[] = [];
      const ws = new WsClient(`ws://localhost:${port}${path}`);
      sockets.push(ws);
      ws.on("message", (data) => msgs.push(data.toString()));
      ws.once("open", () => resolve([ws, msgs]));
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

  it("forwards a user_message from pi to web verbatim", async () => {
    const web = await dial("/session/s1?client=web");
    const pi = await dial("/session/s1?client=pi");

    const webMsg: string[] = [];
    web.on("message", (data) => webMsg.push(data.toString()));

    // Drain handshake messages.
    await delay(20);
    webMsg.length = 0;

    const userMsg = JSON.stringify({
      type: "user_message",
      sessionId: "s1",
      payload: { role: "user", text: "Hello from pi", timestamp: 1000 },
    });
    pi.send(userMsg);
    await delay(50);

    expect(webMsg).toEqual([userMsg]);
  });

  it("forwards an assistant_delta from pi to web verbatim", async () => {
    const web = await dial("/session/s1?client=web");
    const pi = await dial("/session/s1?client=pi");

    const webMsg: string[] = [];
    web.on("message", (data) => webMsg.push(data.toString()));

    await delay(20);
    webMsg.length = 0;

    const deltaMsg = JSON.stringify({
      type: "assistant_delta",
      sessionId: "s1",
      payload: { role: "assistant", delta: "Hello ", timestamp: 1000 },
    });
    pi.send(deltaMsg);
    await delay(50);

    expect(webMsg).toEqual([deltaMsg]);
  });

  it("forwards a user_message from web to pi verbatim", async () => {
    const web = await dial("/session/s1?client=web");
    const pi = await dial("/session/s1?client=pi");

    const piMsg: string[] = [];
    pi.on("message", (data) => piMsg.push(data.toString()));

    await delay(20);
    piMsg.length = 0;

    const userMsg = JSON.stringify({
      type: "user_message",
      sessionId: "s1",
      payload: { role: "user", text: "Hello from web", timestamp: 2000 },
    });
    web.send(userMsg);
    await delay(50);

    expect(piMsg).toEqual([userMsg]);
  });

  it("forwards a sync_request from web to pi verbatim", async () => {
    const web = await dial("/session/s1?client=web");
    const pi = await dial("/session/s1?client=pi");

    const piMsg: string[] = [];
    pi.on("message", (data) => piMsg.push(data.toString()));

    await delay(20);
    piMsg.length = 0;

    const syncReq = JSON.stringify({
      type: "sync_request",
      sessionId: "s1",
      payload: {},
    });
    web.send(syncReq);
    await delay(50);

    expect(piMsg).toEqual([syncReq]);
  });

  it("does not forward ping/pong messages (handled by the relay itself)", async () => {
    const web = await dial("/session/s1?client=web");
    const pi = await dial("/session/s1?client=pi");

    const webMsg: string[] = [];
    const piMsg: string[] = [];
    web.on("message", (data) => webMsg.push(data.toString()));
    pi.on("message", (data) => piMsg.push(data.toString()));

    await delay(20);
    webMsg.length = 0;
    piMsg.length = 0;

    web.send(JSON.stringify({ type: "ping", sessionId: "s1", payload: {} }));
    await delay(50);

    // Ping produces a pong response but should NOT be forwarded
    expect(piMsg.length).toBe(0);
    // ping produces a pong response (asserted in the heartbeat test)
    expect(webMsg.map((m) => JSON.parse(m))).toEqual([
      { type: "pong", sessionId: "s1", payload: {} },
    ]);
  });

  it("drops message silently when the destination peer is gone", async () => {
    const [pi, piMsg] = await dialWithCapture("/session/s1?client=pi");
    const web = await dial("/session/s1?client=web");

    // Drain: pi captures peer_disconnected(web) initially, then
    // peer_connected(web) when web dials.
    await delay(20);
    expect(piMsg.length).toBe(2);
    piMsg.length = 0;

    // Web disconnects — pi receives peer_disconnected(web).
    web.close();
    await delay(30);
    expect(piMsg.length).toBe(1);
    piMsg.length = 0;

    pi.send(JSON.stringify({ type: "user_message", sessionId: "s1", payload: {} }));
    await delay(50);

    // No echo, no error — message is silently dropped.
    expect(piMsg).toEqual([]);
  });

  it("forwards malformed JSON verbatim", async () => {
    const web = await dial("/session/s1?client=web");
    const pi = await dial("/session/s1?client=pi");

    const webMsg: string[] = [];
    web.on("message", (data) => webMsg.push(data.toString()));
    await delay(20);
    webMsg.length = 0;

    const raw = "not-json-at-all";
    pi.send(raw);
    await delay(50);

    expect(webMsg).toEqual([raw]);
  });

  it("forwards multiple messages in order", async () => {
    const web = await dial("/session/s1?client=web");
    const pi = await dial("/session/s1?client=pi");

    const webMsg: string[] = [];
    web.on("message", (data) => webMsg.push(data.toString()));

    await delay(20);
    webMsg.length = 0;

    const msg1 = JSON.stringify({ type: "assistant_delta", sessionId: "s1", payload: { delta: "a", timestamp: 1 } });
    const msg2 = JSON.stringify({ type: "assistant_delta", sessionId: "s1", payload: { delta: "b", timestamp: 2 } });
    const msg3 = JSON.stringify({ type: "assistant_done", sessionId: "s1", payload: { text: "ab", timestamp: 3 } });

    pi.send(msg1);
    pi.send(msg2);
    pi.send(msg3);
    await delay(50);

    expect(webMsg).toEqual([msg1, msg2, msg3]);
  });
});

describe("peer fanout on connect", () => {
  let relay: ReturnType<typeof createRelay>;
  let port: number;
  const sockets: WsClient[] = [];

  /**
   * Create a WebSocket and register a message handler BEFORE the connection
   * opens, so fanout messages sent by the relay on connect are captured.
   * Returns [ws, messageBuffer].
   */
  function dialWithCapture(path: string): Promise<[WsClient, string[]]> {
    return new Promise((resolve, reject) => {
      const msgs: string[] = [];
      const ws = new WsClient(`ws://localhost:${port}${path}`);
      sockets.push(ws);
      ws.on("message", (data) => msgs.push(data.toString()));
      ws.once("open", () => resolve([ws, msgs]));
      ws.once("error", reject);
    });
  }

  /** Like dialWithCapture but for the existing peer (handlers already registered). */
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

  it("first client (web) receives peer_disconnected for the missing pi", async () => {
    const [, webMsg] = await dialWithCapture("/session/s1?client=web");
    // Message handler was registered before open, so the fanout message is captured.
    await delay(20);

    expect(webMsg.length).toBe(1);
    const msg = JSON.parse(webMsg[0]);
    expect(msg).toEqual({
      type: "peer_disconnected",
      sessionId: "s1",
      payload: { peer: "pi" },
    });
  });

  it("first client (pi) receives peer_disconnected for the missing web", async () => {
    const [, piMsg] = await dialWithCapture("/session/s1?client=pi");
    await delay(20);

    expect(piMsg.length).toBe(1);
    const msg = JSON.parse(piMsg[0]);
    expect(msg).toEqual({
      type: "peer_disconnected",
      sessionId: "s1",
      payload: { peer: "web" },
    });
  });

  it("second client (pi) gets peer_connected(web); existing web gets peer_connected(pi)", async () => {
    // Web dials first. Register a capture for web's subsequent messages
    // (the initial peer_disconnected will be there too; we drain it below).
    const [web, webMsg] = await dialWithCapture("/session/s1?client=web");
    await delay(20);
    // The first message is peer_disconnected(pi) — drain it.
    expect(webMsg.length).toBe(1);
    webMsg.length = 0;

    // Now pi joins — register capture before dial.
    const [, piMsg] = await dialWithCapture("/session/s1?client=pi");
    await delay(20);

    // Pi should receive peer_connected(web).
    expect(piMsg.length).toBe(1);
    expect(JSON.parse(piMsg[0])).toEqual({
      type: "peer_connected",
      sessionId: "s1",
      payload: { peer: "web" },
    });

    // Web should receive peer_connected(pi).
    expect(webMsg.length).toBe(1);
    expect(JSON.parse(webMsg[0])).toEqual({
      type: "peer_connected",
      sessionId: "s1",
      payload: { peer: "pi" },
    });
  });

  it("second client (web) gets peer_connected(pi); existing pi gets peer_connected(web)", async () => {
    const [pi, piMsg] = await dialWithCapture("/session/s1?client=pi");
    await delay(20);
    expect(piMsg.length).toBe(1); // peer_disconnected(web)
    piMsg.length = 0;

    const [, webMsg] = await dialWithCapture("/session/s1?client=web");
    await delay(20);

    expect(webMsg.length).toBe(1);
    expect(JSON.parse(webMsg[0]).type).toBe("peer_connected");
    expect(JSON.parse(webMsg[0]).payload).toEqual({ peer: "pi" });

    expect(piMsg.length).toBe(1);
    expect(JSON.parse(piMsg[0]).type).toBe("peer_connected");
    expect(JSON.parse(piMsg[0]).payload).toEqual({ peer: "web" });
  });
});

describe("close→notify", () => {
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

  /** Dial with message capture registered before open. */
  function dialWithCapture(path: string): Promise<[WsClient, string[]]> {
    return new Promise((resolve, reject) => {
      const msgs: string[] = [];
      const ws = new WsClient(`ws://localhost:${port}${path}`);
      sockets.push(ws);
      ws.on("message", (data) => msgs.push(data.toString()));
      ws.once("open", () => resolve([ws, msgs]));
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

  it("when pi disconnects, web receives peer_disconnected(pi)", async () => {
    const [web, webMsg] = await dialWithCapture("/session/s1?client=web");
    const pi = await dial("/session/s1?client=pi");

    // Drain handshake messages (2 per client: peer_disconnected + peer_connected).
    await delay(20);
    webMsg.length = 0;

    // Pi disconnects.
    pi.close();
    await delay(50);

    expect(webMsg.length).toBe(1);
    expect(JSON.parse(webMsg[0])).toEqual({
      type: "peer_disconnected",
      sessionId: "s1",
      payload: { peer: "pi" },
    });
  });

  it("when web disconnects, pi receives peer_disconnected(web)", async () => {
    const [pi, piMsg] = await dialWithCapture("/session/s1?client=pi");
    const web = await dial("/session/s1?client=web");

    // Drain handshake messages.
    await delay(20);
    piMsg.length = 0;

    web.close();
    await delay(50);

    expect(piMsg.length).toBe(1);
    expect(JSON.parse(piMsg[0])).toEqual({
      type: "peer_disconnected",
      sessionId: "s1",
      payload: { peer: "web" },
    });
  });

  it("when both peers are gone and a fresh client connects, it gets peer_disconnected (not peer_connected)", async () => {
    const web = await dial("/session/s1?client=web");
    const pi = await dial("/session/s1?client=pi");

    // Both disconnect.
    pi.close();
    await delay(20);
    web.close();
    await delay(50);

    // Fresh client — register capture before dial.
    const [, freshMsg] = await dialWithCapture("/session/s1?client=web");
    await delay(20);

    expect(freshMsg.length).toBe(1);
    expect(JSON.parse(freshMsg[0])).toEqual({
      type: "peer_disconnected",
      sessionId: "s1",
      payload: { peer: "pi" },
    });
  });
});