/// <reference types="@cloudflare/workers-types" />

import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { CLOSE_DUPLICATE_WEB } from "pi-web-sync-protocol";

/**
 * Miniflare smoke test for the production Durable Object.
 *
 * Exercises a real pi↔web forwarding exchange through the SessionDO,
 * plus the single-tab reject (CLOSE_DUPLICATE_WEB).
 *
 * This guards the only DO-specific code — the adapter glue —
 * after ticket 0041 moved all session policy into RelaySession.
 */

const SESSION = "smoke";

describe("SessionDO smoke test", () => {
  it("forwards a user_message from pi to web through the SessionDO", async () => {
    const stub = env.SESSION.get(env.SESSION.idFromName(SESSION + "-forward"));

    const piRes = await stub.fetch(
      new Request(`http://fake/session/${SESSION}-forward?client=pi`, {
        headers: { Upgrade: "websocket" },
      }),
    );
    const webRes = await stub.fetch(
      new Request(`http://fake/session/${SESSION}-forward?client=web`, {
        headers: { Upgrade: "websocket" },
      }),
    );

    expect(piRes.status).toBe(101);
    expect(webRes.status).toBe(101);
    expect(piRes.webSocket).toBeDefined();
    expect(webRes.webSocket).toBeDefined();

    const piWs = piRes.webSocket!;
    const webWs = webRes.webSocket!;

    piWs.accept();
    webWs.accept();

    // Register listeners before any send.
    const webMsgs: string[] = [];
    webWs.addEventListener("message", (e) => webMsgs.push(e.data as string));

    // Wait for fanout messages to arrive.
    await new Promise((r) => setTimeout(r, 100));

    // Pi sends a user_message.
    const msg = JSON.stringify({
      type: "user_message",
      sessionId: SESSION + "-forward",
      payload: { role: "user", text: "hello" },
    });
    piWs.send(msg);

    // Wait for web to receive it.
    await new Promise((r) => setTimeout(r, 100));
    expect(webMsgs.length).toBeGreaterThan(0);
    // The last message in the buffer should be the forwarded message.
    const forwarded = JSON.parse(webMsgs[webMsgs.length - 1]);
    expect(forwarded.type).toBe("user_message");
    expect(forwarded.payload.text).toBe("hello");
  });

  it("rejects a second web client with CLOSE_DUPLICATE_WEB", async () => {
    const stub = env.SESSION.get(env.SESSION.idFromName(SESSION + "-reject"));

    const web1Res = await stub.fetch(
      new Request(`http://fake/session/${SESSION}-reject?client=web`, {
        headers: { Upgrade: "websocket" },
      }),
    );
    expect(web1Res.status).toBe(101);
    const web1Ws = web1Res.webSocket!;
    web1Ws.accept();

    const web2Res = await stub.fetch(
      new Request(`http://fake/session/${SESSION}-reject?client=web`, {
        headers: { Upgrade: "websocket" },
      }),
    );
    expect(web2Res.status).toBe(101);
    const web2Ws = web2Res.webSocket!;
    web2Ws.accept();

    // Register close listener on web2 and wait.
    const closeCode = await new Promise<number | null>((resolve) => {
      web2Ws.addEventListener("close", (e) => resolve(e.code));
      // Timeout fallback
      setTimeout(() => resolve(null), 2000);
    });

    expect(closeCode).toBe(CLOSE_DUPLICATE_WEB);

    web1Ws.close();
  });
}, 10_000);