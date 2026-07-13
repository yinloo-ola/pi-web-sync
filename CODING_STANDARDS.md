# Coding Standards

Conventions inferred from the codebase. These override the Fowler smell baseline
when they conflict.

## TypeScript

- **`strict: true`** in tsconfig — no loose null checks or implicit any.
- **Module resolution: `bundler`** — import from workspace packages by name
  (`pi-web-sync-protocol`), never relative paths across package boundaries.
- **Prefer `interface` over `type` for object shapes** where the shape is
  exported and stable. Use `type` for unions, intersections, and aliases.
- **Discriminated unions for multi-variant data** — the `PiCommand` union
  (`model` / `skill` / `compact`) is the model; never use a free-form string
  where a union fits.
- **`import type` for compile-time-only dependencies** — the extension depends
  on the protocol package as a type-only devDependency (ADR-004). Value imports
  from devDependencies will fail at runtime on end-user machines.

## Project structure

- **One responsibility per package** — `protocol` owns the wire contract,
  `relay` owns the relay server + Durable Object, `extension` is the pi plugin,
  `webapp` is the browser UI.
- **Private workspace packages** — the protocol package is never published to
  npm; consumers bundle it at build time.
- **Characterization tests before extraction** — when extracting shared logic,
  write integration tests that lock the current behavior first, then extract.
  The extraction is proven equivalent when the same tests pass unchanged.

## Relay

- **Policy lives in `RelaySession`** — single-tab enforcement, fanout,
  forwarding, heartbeat interception. Adapters (`WsRelaySocket`,
  `DoRelaySocket`) are thin wrappers over the platform WebSocket.
- **Slot-null guard in close handlers** — when a socket closes asynchronously
  (e.g. same-type reconnect), the close handler must check that the slot still
  points at the closing socket before nulling it. Otherwise a replacement
  socket is silently lost.
- **`isOpen` is a type guard** — the local `isOpen()` function narrows
  `T | null | undefined` to `T` so callers don't need post-check assertions.
- **`CLOSE_DUPLICATE_WEB` (4002) is the single-tab reject** — imported from
  the protocol package, never duplicated.

## Testing

- **Real-WebSocket integration tests** for relay behavior — use `createRelay(0)`
  and dial real clients via the `ws` library. Mocks are used only for the
  extension's `RelayClient` (injected `MockWebSocket`).
- **`dialWithCapture` for fanout tests** — register the message handler before
  the WebSocket opens, so connect-time messages are never missed.
- **Miniflare smoke test for the Durable Object** — guards the adapter glue
  that no other seam covers. Run separately via `vitest.workers.config.mts`.