/**
 * Connection-liveness helpers for the relay package.
 *
 * Close codes (`CLOSE_DUPLICATE_WEB`, `CLOSE_INVALID_REQUEST`) now live in
 * `pi-web-sync-protocol` — the single source of truth for the wire contract.
 * Import them from there.
 *
 * `isOpen` and `OPEN` are transport-liveness helpers, not wire contract; they
 * stay here.
 */

export { CLOSE_DUPLICATE_WEB, CLOSE_INVALID_REQUEST } from "pi-web-sync-protocol";

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