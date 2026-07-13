# Verification Checklist — pi-web-sync

End-to-end flow test for a self-hosted pi-web-sync deployment. Run through these
after any deployment or refactor to confirm nothing is broken.

## Things to note before you start

### Prerequisites

You need:
- A running **pi instance** with the extension loaded (`pi -e ./index.ts` or
  auto-discovered from `.pi/extensions/`
- A running **relay** (either dev relay via `npm run dev` or production DO via
  `wrangler deploy`)
- A **webapp** deployed (via `wrangler deploy` or `npm run dev`)

### Wire format

The pi-command vocabulary is now a **typed discriminated union**, not a string:

```
PiCommand =
  | { kind: "model"; provider; id }
  | { kind: "skill"; name; args? }
  | { kind: "compact" }
```

Unparseable commands (e.g. `"model"` with no args, `"foo bar"`) are sent as
ordinary user messages instead of reaching the extension's handler. The extension
no longer has an "unknown command" fallback — that logic moved to the webapp.

### Older verification report

A prior report (July 10) found these critical issues — all now fixed by the
architecture refactor (tickets 0036–0042):

| Finding | Fixed by |
|---------|----------|
| URL format mismatch (T-001) | Session-URL builder + parser centralization (0039) |
| Sync request never sent (T-002) | Verified working in useRelay.ts |
| Duplicated RelayMessage type (O-001) | Protocol package (0036) |
| `sessionId` prop unused (O-003) | Cleaned up |
| `sessionId` param in setupForwarding (T-003) | All policy lives in RelaySession now |

---

## 1. Relay connectivity

- [ ] **Dev relay starts:** `npm run dev` in `packages/relay` prints
  `[pi-web-sync] relay listening on ws://localhost:8787`
- [ ] **Health check:** `curl localhost:8787/health` returns `ok`
- [ ] **Invalid path rejected:** a WebSocket connection to `/bogus` receives
  close code **4001** (`CLOSE_INVALID_REQUEST`)
- [ ] **Missing client type rejected:** a WebSocket connection to
  `/session/abc` (no `?client=`) receives close code **4001**

## 2. Extension loads and connects

- [ ] **Extension loads without error:** start pi with the extension loaded.
  No import errors for protocol package types (ADR-004: type-only devDependency).
- [ ] **`/web-sync connect <relay_url>` succeeds:** the relay logs
  `pi connected to session <id>` and the extension logs the session URL.
- [ ] **QR code displays:** a QR widget appears in the pi TUI and auto-dismisses
  after 10 seconds.
- [ ] **Reconnection:** kill and restart the relay — the extension reconnects
  and the status updates from "reconnecting" back to "connected".
- [ ] **Disconnect:** `/web-sync disconnect` closes the connection; pi logs
  `pi disconnected from session <id>`.

## 3. Webapp connects and syncs

- [ ] **Open the session URL** in a browser — the webapp loads and shows
  "Connecting…" → "Connected".
- [ ] **Pi messages appear in webapp:** type something in pi's terminal — the
  message appears in the webapp within ~1 second.
- [ ] **History sync on reload:** refresh the webapp — existing messages
  reappear (sync_response recovers history).
- [ ] **Assistant streaming:** pi generates a response — the webapp shows the
  streaming delta in real time.
- [ ] **Session ended banner:** quit pi — the webapp shows a "Session ended"
  banner within a few seconds.

## 4. Commands from webapp to pi

- [ ] **Slash menu:** type `/` in the webapp input — a dropdown shows
  **model**, **skill**, **compact** with descriptions.
- [ ] **Model switch:** select a from the model submenu — pi switches models;
  the extension logs `Switched to <model>`.
- [ ] **Model not found:** select a model that doesn't exist — pi notifies
  `Model not found: <provider/id>`.
- [ ] **Compact:** select compact from the slash menu — pi compacts context;
  the extension logs `Compacting…`.
- [ ] **Skill:** select a  from the skills submenu, add args, and send —
  pi runs the skill.
- [ ] **Unknown command:** type `/foobar` — it's sent as a regular user message
  (no error, appears in chat).

## 5. Typed command round-trip (post-refactor)

- [ ] **Valid model command parses:** typing `/model anthropic/claude-sonnet-4-5`
  in the webapp sends `{ kind: "model", provider: "anthropic", id: "claude-sonnet-4-5" }`
  on the wire (not a free-form string).
- [ ] **Valid compact parses:** typing `/compact` sends `{ kind: "compact" }`.
- [ ] **Valid skill parses:** typing `/skill:research do a thing` sends
  `{ kind: "skill", name: "research", args: "do a thing" }`.
- [ ] **Unparseable falls through:** typing `/model` (missing model ID) is sent
  as a plain `user_message` — the extension never sees a `pi_command`.
- [ ] **Extension matches on kind:** the extension's `handlePiCommand` uses
  a `switch` on `command.kind` — no string splitting.

## 6. Single-browser-tab policy

- [ ] **Second tab rejected:** while one webapp tab is connected, open a second
  tab to the same URL — the second tab receives close code **4002**
  (`CLOSE_DUPLICATE_WEB`) and shows "Session rejected".
- [ ] **Second tab accepted after first closes:** close the first tab, then
  open a new one — the new tab connects normally.
- [ ] **First tab unaffected:** when the second tab is rejected, the first tab
  continues working (no disconnect).

## 7. Heartbeat / zombie detection

- [ ] **Pi heartbeat:** the extension sends periodic pings — the relay responds
  with pongs. If the pong is missed, the extension reconnects.
- [ ] **Webapp heartbeat:** the webapp sends periodic pings — same pattern.
- [ ] **Zombie recovery:** kill the relay temporarily (~15s), then restart —
  both pi and webapp reconnect automatically.

## 8. Clean shutdown

- [ ] **Pi quits:** quit pi — the relay logs `pi disconnected`.
  The webapp shows "Session ended" within a few seconds.
- [ ] **Relay shutdown:** stop the relay — both pi and webapps show
  "Disconnected" / "reconnecting" and keep retrying.
- [ ] **Relay restarts cleanly:** restart the relay — pi reconnects, webapp
  reconnects, history syncs.

## 9. Production Durable Object (if deployed)

- [ ] **DO deploys:** `wrangler deploy` succeeds in `packages/relay`.
- [ ] **DO forwards messages:** the Miniflare smoke test passes
  (`vitest.workers.config.mts`).
- [ ] **DO rejects second tab:** same as section 6 — the DO enforces
  single-tab policy.
- [ ] **DO zombie detection:** same as section 7 — heartbeat works through DO.

## Things to watch for

| Area | What to watch for |
|------|-------------------|
| **Protocol skew** | If you update the extension without updating the webapp (or vice versa), typed commands will break — the payload shape changed from `{ command: string }` to `{ command: PiCommand }`. There is no backward-compat shim. |
| **Extension install** | The extension has a type-only devDep on `pi-web-sync-protocol`. If someone installs the extension without running `npm install` in the repo, types will resolve at jiti-time but values will not. Ensure the protocol package workspace link is set up. |
| **Session URL format** | The URL format is `/session/<id>?client=pi\|web` — centralized in the protocol package. If you change it, update both `buildSessionWsUrl` and `parseSessionWsPath`. The extension's inline builder has a round-trip test that catches drift. |
| **DO specific** | The Durable Object isn't tested in CI — only by the Miniflare smoke test (run it manually before deploy). Policy behavior is identical to the dev relay (same `RelaySession`), so confidence is high. |