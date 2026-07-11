# Verification pass — pi-web-sync production hardening (ticket 0010)

**Date:** 2026-07-11
**Map:** [pi-web-sync production hardening](../.scratch/issues/0001-map-production-hardening.md)
**Verdict:** Destination **not yet reached.** Three gaps found → tickets 0011, 0012, 0013.
Criteria 2 (zombie), 3 (single tab), 4 (clean shutdown) **pass**; criterion 1 (disconnect
survival) **passes on reconnect + pi-leg buffering but fails on history recovery and is
undermined by a UI gap**; criterion 5 (observability) **passes for the dev relay, fails for
the production DO**.

---

## Method

Exercised as a running system, not by reading code:

- **Relay:** the real dev relay (`packages/relay/src/relay-server.ts`) on `ws://localhost:8787`.
  Killed / `kill -STOP` / restarted by listener PID to simulate outage and half-open zombies.
- **Pi leg:** the **real production client** — `RelayClient` from `packages/extension/relay-client.ts`
  (partysocket + ws + heartbeat + buffering + reconnect + disconnect) — driven through a small
  HTTP-control harness (`.scratch/verify/pi-leg.ts`). Run under **jiti**, the exact loader pi uses
  for extensions (`jiti.import(extensionPath, { default: true })`), so `import { WebSocket } from
  "partysocket"` resolves to the constructor as it does in pi. *(The pi event glue —
  `pi.on("input"/"message_update"/"session_shutdown")` — is out of scope for the transport
  destination and not exercised.)*
- **Web leg:** the real webapp (`packages/webapp`, Vite) in a real Chromium browser via
  `agent-browser`, pointed at the local relay via `.env.local`.

Smoke test confirmed full bidirectional round-trip (pi-leg `assistant_done` → browser; browser
`user_message` → pi-leg) before formal scenarios.

Evidence captured: pi-leg status JSON (`/status`), libuv handle dumps (`/handles`), relay logs,
browser DOM text, and screenshots (`.scratch/verify/screenshots/`).

---

## Criterion 1 — disconnect survival + message buffering (tickets 0002, 0003)

### Result: MIXED

| Sub-criterion | Result |
|---|---|
| Both sides detect outage → reconnecting → connected | **PASS** |
| pi-leg buffers sends during outage, flushes on reconnect (no drop) | **PASS** |
| webapp can send during outage (buffering reachable from UI) | **FAIL** — input disabled |
| `sync_response` recovers history on the webapp side | **FAIL** — handler missing |

**PASS — reconnect + pi-leg buffering (brief outage, session `s1b`):**

Killed the relay mid-session; both sides went reconnecting within seconds (pi-leg `reconnecting`;
browser "Reconnecting… (attempt 2)"). Queued a message from the pi-leg while the relay was down
(`buffered-pi-1b`). Restarted the relay within ~5 s. Both auto-reconnected; the buffered message
flushed through to the browser with no drop:

```
browser after reconnect: "Relay: Connected\nPi Connected\n\nbuffered-pi-1b (queued while relay down)\n\nSend"
relay log: [pi-web-sync] forwarded 150 bytes: pi → web
```

**FAIL — webapp cannot send during an outage (input disabled):**

`Chat.tsx` computes `canSend = connectionState === "connected" && piStatus !== "disconnected"`
and sets `disabled={!canSend}` on the input. While the relay is reconnecting/failed/connecting,
the input is disabled (`disabled: true`, placeholder "Waiting for relay connection…"). A user
therefore **cannot send a message during an outage**, so the partysocket message buffering added in
ticket 0002 is unreachable from the UI — it is only exercised by a programmatic `send()`, which the
UI never calls while disconnected. → **Ticket 0012**.

**FAIL — `sync_response` history recovery is not implemented:**

The webapp sends `sync_request` on every (re)connect (`useRelay.ts:138`), and the pi leg replies
with `sync_response` (verified: pi-leg log `sync_request -> sent sync_response (2 history msgs)`).
But `grep -rn "sync_response" packages/webapp/src/` returns **zero matches** — there is no handler
for `sync_response` anywhere. `useRelay` forwards it to `handleMessage` in `App.tsx`, which branches
only on `user_message` / `assistant_delta` / `assistant_done`, so `sync_response` is silently
dropped. Confirmed empirically: after connect, browser localStorage was `{}` and the history
messages never rendered. A fresh browser open therefore shows an empty conversation even when pi
holds history, and there is no safety net for messages lost during asymmetric reconnects. →
**Ticket 0011**.

**Noted (by design, not a bug):** outages longer than ~40 s exhaust `maxRetries` (10); both sides
transition to `failed` and require a manual **Reconnect** click (pi-leg footer / webapp banner
button). This is the intended partysocket give-up + manual-recovery path.

---

## Criterion 2 — zombie detection (ticket 0006)

### Result: PASS

Session `s2-zombie`. With both sides connected, `kill -STOP`-ed the relay (TCP stays open, no
`pong` returns — a true half-open zombie, no close frame). Within ~40 s (30 s ping interval + 10 s
pong timeout — exactly as designed), both clients detected the zombie and reconnected:

```
pi-leg: 14:45:32 connected → 14:46:12 reconnecting (attempt 0)   [40 s later]
browser: "Relay: Reconnecting… (attempt 1)"
```

After `kill -CONT`, both recovered:

```
pi-leg: state=connected  (history tail: reconnecting 6 → connected 0)
browser: "Relay: Connected | Pi Connected"
relay log: web/pi disconnected (code=1006) → web/pi connected
```

Screenshot: `.scratch/verify/screenshots/s2-zombie-detected.png`, `s2-recovered.png`.

---

## Criterion 3 — single browser tab (ticket 0004)

### Result: PASS

Session `s3-tab`. Tab 1 connected ("Relay: Connected"). Opening a second tab to the same session
URL was rejected with close code 4002:

```
tab 2: "Relay: Rejected | Pi Status Unknown | This session is already open in another tab. | Try again"
```

The rejected tab did **not** reconnect-loop — `shouldReconnectOnClose` returns false for 4002
(`useRelay.ts`); 6 s later it was still "Rejected". After closing tab 1, a new tab was accepted
(stale slot replaced):

```
relay log: web disconnected (code=1001) → web connected (1 active sessions)
new tab: "Relay: Connected | Pi Connected"
```

Screenshot: `s3-tab2-rejected.png`, `s3-newtab-accepted.png`.

---

## Criterion 4 — clean shutdown (ticket 0005)

### Result: PASS

Session `s4-shutdown`. Called `RelayClient.disconnect()` (the exact code path behind both
`/web-sync disconnect` and `session_shutdown`, which both reduce to `client.disconnect()` in
`packages/extension/index.ts`).

Immediately after disconnect:

- `/handles` (libuv active handles): the relay Socket (port 8787) is **gone**; total dropped 3 → 2
  (only the HTTP control `Server` + the transient curl socket remain).
- pi-leg `statusHistory` unchanged — `[('connected', 0)]`; **no `reconnecting` entry** → no
  auto-reconnect.
- relay log: `pi disconnected from session s4-shutdown (code=1000, reason=)` — normal closure;
  session cleaned up (pi slot removed, web still connected).
- browser: "Relay: Connected | **Pi Disconnected**" — webapp received `peer_disconnected` and
  updated, while itself staying connected to the relay (correct — only pi quit).

**40 s later** (past one full 30 s heartbeat cycle): `/handles` still total 2 with no relay socket;
`statusHistory` still `[('connected', 0)]`; relay log shows no further `s4-shutdown` activity; pi-leg
log silent after `disconnect()`. → **no leaked heartbeat/partysocket timers.**

Screenshot: `s4-after-disconnect.png`.

---

## Criterion 5 — observability (cross-cutting; fog)

### Result: PARTIAL — dev relay sufficient; production DO has zero logging

- **Dev relay** (`relay-server.ts`, 6 log statements): logs listen-ready, per-client connect/
  disconnect with session ID + close code + active session count, forwarded byte counts (debug),
  and errors. **Sufficient** for a self-hoster to debug any of the failure modes above.
- **Production Durable Object** (`packages/relay/src/index.ts`): `grep` confirms **zero** logging
  statements. A self-hoster who deploys the Cloudflare Worker (the documented production path —
  "Durable Objects are required for production") gets **no visibility** via `wrangler tail`. The dev
  relay is well-instrumented; the production relay is a black box. → **Ticket 0013**.
- **Extension / webapp:** connection-state changes are surfaced through the pi footer / webapp UI
  rather than console logs. Acceptable for interactive use; minor gap for after-the-fact log
  debugging. Not graduated — the UI is the intended surface.

The DO path itself was not runtime-exercised by this pass (the ticket scoped it out: "this pass
uses the dev relay, so the DO path is unexercised"). The zero-logging finding is code-confirmed.

---

## Graduating tickets

| # | Title | Type | Blocked by |
|---|---|---|---|
| 0011 | Handle `sync_response` in the webapp to recover history | task | — |
| 0012 | Webapp input locked during outage — decide whether to allow sending-while-disconnected | task | — |
| 0013 | Add logging to the production Durable Object relay | task | — |

None of the three blocks another (independent fixes). The map's **Not yet specified** fog about
"whether to add DO logging" graduates into ticket 0013; the rest graduates from exercising the
running system.