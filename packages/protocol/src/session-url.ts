/**
 * Session WebSocket URL builder and parser.
 *
 * Single source of truth for the `/session/:id?client=pi|web` URL format.
 * The web app uses `buildSessionWsUrl` to construct URLs; the relay uses
 * `parseSessionWsPath` to extract session IDs from incoming connections.
 *
 * The extension keeps its own inline builder (per ADR-004: it cannot take a
 * runtime dependency on this private package). A round-trip test in the
 * extension package asserts the inline form produces parseable URLs.
 */

/**
 * Build a WebSocket URL for a session + client type.
 *
 * @param relayUrl - Base URL of the relay (e.g. "wss://relay.example.com" or "ws://localhost:8787")
 * @param sessionId - Session identifier
 * @param clientType - "pi" or "web"
 */
export function buildSessionWsUrl(
  relayUrl: string,
  sessionId: string,
  clientType: "pi" | "web",
): string {
  // Strip trailing slash from relayUrl to avoid double-slash
  const base = relayUrl.replace(/\/+$/, "");
  return `${base}/session/${sessionId}?client=${clientType}`;
}

/**
 * Parse the session ID from a WebSocket upgrade request path.
 *
 * Matches the relay's regex: `/^\/session\/([^/]+)$/`
 * Returns null if the path doesn't match.
 */
export function parseSessionWsPath(
  pathname: string,
): { sessionId: string } | null {
  const match = pathname.match(/^\/session\/([^/]+)$/);
  if (!match) return null;
  return { sessionId: match[1] };
}