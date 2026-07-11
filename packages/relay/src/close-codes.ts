/**
 * WebSocket close codes and connection-liveness helpers shared by both relay
 * implementations (`relay-server.ts` dev relay, `index.ts` Durable Object).
 *
 * Close codes use the private-use range 4000–4999. The web app recognizes
 * {@link CLOSE_DUPLICATE_WEB} to avoid retrying forever (see useRelay's
 * `shouldReconnectOnClose`). If you change a code here, update the mirrored
 * constant in `packages/webapp/src/hooks/useRelay.ts` — a shared types package
 * (ticket 0008) will eventually remove this duplication.
 */

/** Malformed request: bad session path or missing/invalid `?client=`. */
export const CLOSE_INVALID_REQUEST = 4001;

/** A second *web* client tried to join a session that already has a live one. */
export const CLOSE_DUPLICATE_WEB = 4002;

/**
 * readyState value for an open WebSocket. Centralized so neither relay leans on
 * a platform static (`ws.WebSocket.OPEN` / the Workers-typed `WebSocket`)
 * that may not exist as a static property on every WebSocket type — the
 * production DO previously referenced `WebSocket.READY_STATE_OPEN`, which the
 * Workers types don't define.
 */
export const OPEN = 1;

/** True if `ws` is present and currently in the OPEN state. Generic so a truthy
 * result narrows away null/undefined at the call site (it's a type guard). */
export function isOpen<T extends { readyState: number }>(
  ws: T | null | undefined,
): ws is T {
  return ws !== null && ws !== undefined && ws.readyState === OPEN;
}