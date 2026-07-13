import { describe, it, expect } from "vitest";
import { parseSessionWsPath, buildSessionWsUrl } from "pi-web-sync-protocol";

/**
 * Characterization: the extension's inline URL builder (per ADR-004) must
 * produce URLs that the shared parser accepts. The extension cannot import the
 * builder at runtime (private package, no build step), so it keeps its own
 * inline form. This test retires the "client/server URL format must match" risk.
 */
describe("extension inline URL builder round-trip", () => {
  it("the extension's inline URL format is parseable by the shared parser", () => {
    // Reproduce the extension's inline builder exactly (relay-client.ts:85):
    //   `${this.url}/session/${this.sessionId}?client=pi`
    const relayUrl = "wss://relay.example.com";
    const sessionId = "sess-abc";
    const inlineUrl = `${relayUrl}/session/${sessionId}?client=pi`;

    // Extract the pathname as the relay would and parse it.
    const pathname = new URL(inlineUrl).pathname;
    const parsed = parseSessionWsPath(pathname);

    expect(parsed).toEqual({ sessionId });
  });

  it("matches the shared builder output exactly", () => {
    // We can import the builder here because this is a test file, not the
    // extension runtime. The extension itself cannot.
    const relayUrl = "wss://relay.example.com";
    const sessionId = "sess-abc";

    // Extension inline form
    const inlineUrl = `${relayUrl}/session/${sessionId}?client=pi`;
    // Shared builder form
    const sharedUrl = buildSessionWsUrl(relayUrl, sessionId, "pi");

    expect(inlineUrl).toBe(sharedUrl);
  });

  it("also works with ws:// and localhost (dev mode)", () => {
    const relayUrl = "ws://localhost:8787";
    const sessionId = "dev-session";
    const inlineUrl = `${relayUrl}/session/${sessionId}?client=pi`;
    const sharedUrl = buildSessionWsUrl(relayUrl, sessionId, "pi");

    expect(inlineUrl).toBe(sharedUrl);

    const pathname = new URL(inlineUrl).pathname;
    expect(parseSessionWsPath(pathname)).toEqual({ sessionId });
  });
});