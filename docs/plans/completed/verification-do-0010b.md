# Verification pass 0010b — production Durable Object relay

**Date:** 2026-07-11
**Map:** [pi-web-sync production hardening](../.scratch/issues/0001-map-production-hardening.md)
**Motivation:** Verification pass [0010](verification-pass-0010.md) exercised the **dev relay**
(`relay-server.ts`) only; the production Durable Object (`packages/relay/src/index.ts`) was
never runtime-exercised — its behavior was an assumption based on code reading. This pass runs
the same criteria against the production DO to confirm parity (or surface divergence).

**Setup:** `wrangler dev --port 8787 --local` runs the real Worker + `SessionDO` Durable Object
exactly as deployed (the `wrangler.toml` bindings and migrations apply locally). Clients are the
real production `RelayClient` (driven via the pi-leg harness under jiti, as in pass 0010) and raw
`ws` sockets for targeted single-criterion probes.

**Verdict:** The production DO behaves **identically to the dev relay** on every transport
criterion — zombie/heartbeat, single-tab, clean shutdown, live forwarding, and the same
buffered-flush peer-timing limitation. **No DO-specific transport bug found.** Criterion 5
(observability) **fails for the DO**, exactly as graduated to ticket 0013.

---

## Method

- **Relay:** the real production Worker + `SessionDO` DO via `wrangler dev --port 8787 --local`
  (bindings: `env.SESSION` → `SessionDO`; migration `new_sqlite_classes = ["SessionDO"]`).
  Health check `GET /health` → `ok` confirms the Worker (not the dev relay) is serving.
- **Pi leg:** the real `RelayClient` from `packages/extension/relay-client.ts`, driven through
  the same HTTP-control harness as pass 0010 (`.scratch/verify/pi-leg.ts`), run under jiti so
  `import { WebSocket } from "partysocket"` resolves as it does in pi. `RELAY_URL` pointed at
  `ws://localhost:8787`.
- **Web leg:** raw `ws` sockets for the single-criterion probes (deterministic, no browser
  automation needed to exercise the DO's server-side behavior).

Outage was simulated by `pkill -f "wrangler dev"` and restart via `wrangler dev` (the DO's
in-memory state is lost on restart, as it would be for any non-hibernated local DO session).

---

## Results

| Criterion | Dev relay (0010) | Production DO (0010b) | Verdict |
|---|---|---|---|
| 1 — disconnect survival (reconnect + live forward) | pass | **pass** | parity |
| 1 — disconnect survival (buffered flush) | fails (peer-timing) | **fails (peer-timing)** | parity |
| 1 — history recovery (`sync_response`) | fails (0011) | n/a (webapp gap, not relay) | — |
| 2 — zombie / heartbeat | pass | **pass** | parity |
| 3 — single browser tab | pass | **pass** | parity |
| 4 — clean shutdown | pass | **pass** | parity |
| 5 — observability (dev relay) | pass | — | — |
| 5 — observability (production DO) | fails (0013) | **fails** | confirmed |

### Criterion 2 — heartbeat / zombie detection  ✅

The DO answers `ping` messages directly (does not forward), so a lone client can probe its own
leg to the relay. Verified: a pi client with no peer sent `{"type":"ping"}` and received
`{"type":"pong",...}`. The client-side heartbeat (missed pong → close) therefore works against
the DO exactly as against the dev relay.

### Criterion 3 — single browser tab  ✅

A second `web` client joining a session with a live web peer is rejected with close code **4002**
(`CLOSE_DUPLICATE_WEB`, reason `"Session already has an active browser"`), and the first web
client **survives** (its socket stays OPEN). The DO's `if (clientType === "web" && isOpen(this.web))`
guard works identically to the dev relay's. Pi may still replace pi.

### Criterion 4 — clean shutdown  ✅

When pi closes, the web peer receives `{"type":"peer_disconnected","peer":"pi"}`, and the DO
**releases the pi slot** — verified by a fresh pi rejoining the same session immediately after,
which produced `peer_connected` on the web side. (The local `ws` client observes its own close as
1006 rather than 1000 — a `ws`/miniflare echo artifact, not a DO defect; the DO processed the
close and cleaned up state correctly.)

### Criterion 1 — disconnect survival  ✅ live / ⚠️ buffered-flush (parity)

- **Live forwarding, both directions:** after the real `RelayClient` reconnected to the DO
  following an outage, a live `assistant_done` from pi reached the web peer (`DO-LIVE-AFTER-RECONNECT`),
  and a `user_message` from web reached pi. Bidirectional forwarding through the DO works.
- **Reconnect:** the real `RelayClient` (partysocket + backoff) detected the DO outage
  (`connecting` → `reconnecting`, attempts 1…7 with exponential backoff) and reconnected cleanly
  (`connected`, attempt 0) once the DO was back. No DO-side issue.
- **Buffered flush:** a message sent by pi-leg *during* the outage (buffered in partysocket) did
  **not** reach a web peer that attached *after* pi-leg reconnected. This is the **same
  peer-must-exist-at-flush-time limitation** documented for the dev relay in pass 0010: when
  partysocket flushes its enqueue on reconnect-open, the DO forwards only if `isOpen(other)` —
  and if the web leg isn't connected yet, the message is dropped. This is a transport-architecture
  property shared by both relays, **not a DO-specific bug**. (Tickets 0011/0012 address the
  webapp-side recovery; the relay behavior is parity-confirmed.)

### Criterion 5 — observability  ❌ (confirmed, → 0013)

`wrangler tail` for the local DO showed **only** Cloudflare's HTTP-level fetch logs:

```
[wrangler:info] GET /session/do-buf-final 101 Switching Protocols (7ms)
[wrangler:info] GET /health 200 OK (7ms)
```

There was **zero** application logging from the DO: no connect/disconnect events, no session
IDs, no close codes, no forwarding byte counts, no errors. A self-hoster deploying the production
Worker gets a black box. The dev relay (`relay-server.ts`) logs all of these. This confirms the
finding that graduated to ticket [0013](../.scratch/issues/0013-add-logging-production-do.md).

---

## Conclusion

The production Durable Object relay is **transport-parity with the dev relay** — no new bug
surfaced by exercising the DO at runtime. The one genuine production-only gap is observability
(criterion 5, ticket 0013), which remains open. Pass 0010's decision to use the dev relay for the
full end-to-end pass (including the browser) is retrospectively validated: the DO adds no
behavioral divergence, only the missing logging.

Open tickets unchanged: [0011](../.scratch/issues/0011-handle-sync-response-webapp.md) (webapp
`sync_response`), [0012](../.scratch/issues/0012-webapp-input-locked-during-outage.md) (webapp
input lock), [0013](../.scratch/issues/0013-add-logging-production-do.md) (DO logging).