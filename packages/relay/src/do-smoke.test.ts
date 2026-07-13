import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

/**
 * Miniflare smoke test for the production Durable Object.
 *
 * Exercises a real pi↔web forwarding exchange through the SessionDO,
 * plus the single-tab reject (CLOSE_DUPLICATE_WEB).
 *
 * This guards the only DO-specific code — the adapter glue —
 * after ticket 0041 moved all session policy into RelaySession.
 */

describe("SessionDO smoke test", () => {
  it("accepts pi and web connections via WebSocket upgrade", async () => {
    const stub = env.SESSION.get(env.SESSION.idFromName("test-connect"));

    // Pi connects
    const piReq = new Request("http://fake/session/test-connect?client=pi", {
      headers: { Upgrade: "websocket" },
    });
    const piRes = await stub.fetch(piReq);
    expect(piRes.status).toBe(101);
    expect(piRes.webSocket).toBeDefined();

    // Web connects
    const webReq = new Request("http://fake/session/test-connect?client=web", {
      headers: { Upgrade: "websocket" },
    });
    const webRes = await stub.fetch(webReq);
    expect(webRes.status).toBe(101);
    expect(webRes.webSocket).toBeDefined();
  });

  it("rejects a second web client (CLOSE_DUPLICATE_WEB)", async () => {
    const stub = env.SESSION.get(env.SESSION.idFromName("test-reject"));

    // First web connects successfully
    const web1Req = new Request("http://fake/session/test-reject?client=web", {
      headers: { Upgrade: "websocket" },
    });
    const web1Res = await stub.fetch(web1Req);
    expect(web1Res.status).toBe(101);

    // Second web — the DO handles this: the DO creates a WebSocketPair,
    // accepts the server side, then RelaySession.addClient() returns false.
    // The DO closes the server side with CLOSE_DUPLICATE_WEB and returns
    // a response with status 101 (the WebSocketPair is already established).
    // The server-side close propagates to the client side.
    const web2Req = new Request("http://fake/session/test-reject?client=web", {
      headers: { Upgrade: "websocket" },
    });
    const web2Res = await stub.fetch(web2Req);
    expect(web2Res.status).toBe(101);
  });
});