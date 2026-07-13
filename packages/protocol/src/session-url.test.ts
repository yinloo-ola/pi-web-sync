import { describe, it, expect } from "vitest";
import {
  buildSessionWsUrl,
  parseSessionWsPath,
} from "./session-url";

describe("buildSessionWsUrl", () => {
  it("builds a pi client URL", () => {
    const url = buildSessionWsUrl("wss://relay.example.com", "abc-123", "pi");
    expect(url).toBe("wss://relay.example.com/session/abc-123?client=pi");
  });

  it("builds a web client URL", () => {
    const url = buildSessionWsUrl("wss://relay.example.com", "abc-123", "web");
    expect(url).toBe("wss://relay.example.com/session/abc-123?client=web");
  });

  it("handles ws:// scheme", () => {
    const url = buildSessionWsUrl("ws://localhost:8787", "sess", "pi");
    expect(url).toBe("ws://localhost:8787/session/sess?client=pi");
  });

  it("preserves trailing slashes in the base URL without duplicating the slash", () => {
    const url = buildSessionWsUrl("wss://relay.example.com/", "abc", "web");
    // Normalize: no double slash
    expect(url).not.toContain("//session");
    expect(url).toContain("/session/abc?client=web");
  });
});

describe("parseSessionWsPath", () => {
  it("parses a valid /session/:id path", () => {
    const result = parseSessionWsPath("/session/abc-123");
    expect(result).toEqual({ sessionId: "abc-123" });
  });

  it("parses a valid /session/:id (no query string — caller should pass pathname only)", () => {
    // The relay strips query params before calling this parser, so
    // the input is always a bare pathname.
    const result = parseSessionWsPath("/session/abc-123");
    expect(result).toEqual({ sessionId: "abc-123" });
  });

  it("returns null for an invalid path", () => {
    expect(parseSessionWsPath("/bogus")).toBeNull();
    expect(parseSessionWsPath("/session/")).toBeNull();
    expect(parseSessionWsPath("/")).toBeNull();
    expect(parseSessionWsPath("")).toBeNull();
  });
});

describe("URL round-trip (builder → parser)", () => {
  it("builder output is parseable by the parser for both client types", () => {
    const relayUrl = "wss://relay.example.com";
    const sessionId = "my-session";

    const piUrl = buildSessionWsUrl(relayUrl, sessionId, "pi");
    const webUrl = buildSessionWsUrl(relayUrl, sessionId, "web");

    // Extract just the path (as a URL object would) to feed to the parser.
    const piPath = new URL(piUrl).pathname;
    const webPath = new URL(webUrl).pathname;

    expect(parseSessionWsPath(piPath)).toEqual({ sessionId });
    expect(parseSessionWsPath(webPath)).toEqual({ sessionId });
  });

  it("matches the exact path format the relay's regex accepts", () => {
    // The relay uses: /^\/session\/([^/]+)$/
    const relayPattern = /^\/session\/([^/]+)$/;
    const url = buildSessionWsUrl("ws://localhost:8787", "test-42", "web");
    const path = new URL(url).pathname;
    const match = path.match(relayPattern);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("test-42");
  });
});