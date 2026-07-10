# Lessons Learned

<!--
Agent: read this at the start of each task during ptk-execute.
Follow every rule. Add new rules when you catch yourself making repeat mistakes.
Rules must be generic patterns applicable to any domain or feature — not specific to one service, entity, or use case.
Retire rules that don't apply during finalizing.
-->

## Architecture Rules

- **Client-server URL format must match exactly.** When a backend parses a URL path with a regex, every client constructing that URL must produce the same format. A mismatch (e.g. query-param session ID vs. path segment) causes silent connection failure. Test the full round-trip: client URL construction → server regex → successful connection.

- **WebSocket clients must send handshake/protocol messages on `open`.** Simply connecting and setting up `message` listeners is not enough — if the server expects an initial message (e.g. `sync_request`), register an `open` listener that sends it. Verify this in tests or by tracing the message flow.

## Tool Usage

- **Use `console.log` for debugging WebSocket message flow.** Add a log at every send and receive point (client connect, client send, server receive, server forward, client receive) to trace messages end-to-end. This is the fastest way to find silent failures.

- **When a WebSocket relay transitions from a simple Worker to Durable Objects**, the connection pattern changes: the DO's `fetch` method receives the WebSocket upgrade, not the Worker's `fetch`. Ensure the path routing logic is replicated in both layers.

## Testing Patterns

- **Characterize existing behavior before fixing.** When fixing a bug in code with no tests, first write a characterization test that documents the current (buggy) behavior, then fix the code and update the assertion. This prevents regressions and confirms what actually changed.

- **Test WebSocket URL construction with explicit expected strings.** Don't just test that the connection opens — assert that the URL passed to `new WebSocket()` matches the exact format the server expects.

## Rules

- Prefer `warn()` over silent failure for env vars with placeholder defaults. Log a warning if an env var is unset and a placeholder like `example.com` is being used.
- When duplicating a type across packages (monorepo without shared package), add a comment noting where the mirror lives and that they must stay in sync.