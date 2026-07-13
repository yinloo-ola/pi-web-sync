# Characterization coverage audit — A/B/D refactors

**Ticket:** [0034 — Characterization coverage audit](../.scratch/issues/0034-characterization-coverage-audit.md)
**Map:** [0028 — Deepen the wire protocol & relay architecture](../.scratch/issues/0028-protocol-relay-deepening.md)
**Method:** Read every test file and every production path the A/B/D refactors touch.
No tests were executed (fog mode; and coverage gaps are found by reading what is
*not* asserted, not by running). **54 tests across 5 files.**

---

## Headline finding

> The relay policy that **B** extracts — normal-message forwarding,
> `peer_connected`/`peer_disconnected` fanout, and close→notify-other — is
> **untested in both relay implementations**. The dev relay's 7 tests cover only
> `isOpen`, heartbeat-intercept, and single-tab-reject. The production Durable
> Object has **zero** CI tests. And the extension's `handlePiCommand` (the exact
> behavior **D** replaces) has **zero** tests.
>
> Extracting the relay policy or retyping commands *before* characterizing these
> would be a **rewrite, not a refactor**. The minimum-tests-before lists below
> are the gates that make B and D safe.

---

## Test inventory — what each file actually covers

### `packages/relay/src/relay-server.test.ts` — **7 tests** (dev relay only)

| Group | Covers |
|---|---|
| `close-codes` (1) | `isOpen` truthy only at `readyState === 1`; false for 0/2/3/null/undefined |
| `heartbeat` (1) | web & pi both dial; a `ping` is answered with `pong` by the relay and **not** forwarded to the peer (asserted both directions) |
| `single-browser-tab` (5) | reject 2nd `web` with `CLOSE_DUPLICATE_WEB`; accept `web` after the first closed; `pi` may replace `pi`; one `web`+one `pi` coexist; invalid path → `CLOSE_INVALID_REQUEST` |

**Not covered (relevant to B):** forwarding of a *normal* message (pi→web,
web→pi); `peer_connected`/`peer_disconnected` fanout on connect; close→notify
the other peer; session-map cleanup when both peers gone. *(In the heartbeat
test the fanout messages are received but deliberately discarded —
`webMsg.length = 0` — never asserted.)*

### `packages/extension/relay-client.test.ts` — **10 tests** (`RelayClient`, injected `MockWebSocket`)

| Group | Covers |
|---|---|
| `connect` (2) | builds the `?client=pi` URL + resolves on open; rejects on initial error + stops partysocket retrying |
| `send + buffering` (1) | buffers while CONNECTING, flushes on open |
| `message handling` (1) | forwards `user_message`; routes `sync_request` to its handler (not forwarded); drops `peer_disconnected` |
| `status` (1) | `connected` on open; `reconnecting(1)` on a mid-session drop |
| `heartbeat` (2) | sends ping on interval + clears timeout on pong (no reconnect); reconnects on missed pong |
| `disconnect` (3) | closes socket; no auto-reconnect after deliberate disconnect; fresh `connect()` after disconnect |

**Not covered:** explicit `reconnect()`; the `minUptime` stable-timer counter
reset (implicit only); the `failed` terminal state after `MAX_RETRIES`. Low
relevance to A/B/D.

### `packages/webapp/src/hooks/useRelay.test.ts` — **9 tests** (global `MockWebSocket` stub)

| Group | Covers |
|---|---|
| `heartbeat` (2) | reconnect on pong-timeout (zombie); no reconnect when pong arrives in window |
| buffering (1) | buffers while CONNECTING, flushes on open; `sync_request` sent on open |
| duplicate-tab (1) | close `4002` → state `"rejected"`, no reconnect loop |
| `sync_response` (1) | forwarded to `onMessage` (not dropped) |
| `session_ended` (4) | msg → `sessionEnded`; no pi within 5 s → stale; pi within 5 s → false; `sync_response` within 5 s → false |

**Not covered (relevant to D / wire protocol):** `peer_connected`/`peer_disconnected`
→ `piStatus` state; `models_list`/`skills_list` → `availableModels`/`availableSkills`;
`reconnect()` button path; `retryAttempt` counting; `failed` after `MAX_RETRIES`.

### `packages/webapp/src/components/SlashMenu.test.tsx` — **19 tests**

Thoroughly covers the **webapp's command-string construction**: command list
render/filter/nav (8), model submenu incl. `onSelect("model provider/id")` (6),
skill submenu incl. `onFillInput("/skill:name ")` (5). This is the *build* half
of the D round-trip and it is well characterized.

### `packages/webapp/src/hooks/useLocalStorage.test.ts` — **9 tests**

`mergeMessages` dedup+sort/persist/no-op (5), `clearMessages` (1), TTL expiry (3).
Unrelated to A/B/D. *(Note: `clearMessages` is live and tested — wired via
`App.tsx` `onClearChat` — despite ticket 0008 once marking it dead code.)*

---

## Gaps by refactor, ranked

### B (relay policy extraction) — **CRITICAL**

The policy B extracts is precisely the part that is *not* characterized:

- **Normal-message forwarding is untested** in both relays
  (`relay-server.ts:114,134` dev; `index.ts:92,111` DO). No test ever sends a
  non-`ping` message and asserts the peer receives it. This is the relay's
  reason for existing.
- **`peer_connected`/`peer_disconnected` fanout is untested** in both
  (`relay-server.ts:93-106` dev; `index.ts:74-85` DO). The connect-time
  notification of the other peer is received-but-discarded in tests, never
  asserted.
- **close→notify-other is untested** in both
  (`relay-server.ts:143-151` dev; `index.ts:119-123` DO).
- **The production `SessionDO` has zero CI tests.** Ticket 0010b proved
  transport-parity with the dev relay *by hand* under `wrangler dev` only.
  (This is ticket 0033's concern.)

The dev relay's 7 tests **do** characterize the other policy parts — single-tab
enforcement and heartbeat interception — so those are safe to carry over.

### D (typed pi-command round-trip) — **HIGH**

- **`handlePiCommand` (`packages/extension/index.ts:81`) has zero tests.** This
  is the string-parsing behavior D replaces (`split(" ")`, `indexOf("/")`,
  `startsWith("skill:")`). It is completely uncharacterized — changing the wire
  format here cannot be proven equivalent.
- `App.tsx`'s `handleSendCommand` (wraps the command string into
  `{type:"pi_command",payload:{command}}`) is untested, but lower risk —
  SlashMenu's 19 tests cover the command-string construction upstream.
- The wider extension `index.ts` event wiring (`pi.on("input")` :372,
  `message_update` :392, `message_end` :407, `session_shutdown` :419,
  `onSyncRequest`/`getBranch` :219, `sendModelsAndSkills` :137) is untested.
  Relevant to the wire protocol broadly, but `handlePiCommand` is the D-critical
  one.

### A (protocol package extraction) — **LOW → MEDIUM**

- **Types:** zero runtime risk — every import is `import type` (erased by
  jiti/vite). The cross-package `tsc` (root `tsconfig.json` includes
  `packages/**`) is the guard. **Safe.**
- **Close codes:** the `4002` value is pinned *indirectly* — the relay test
  asserts the close uses `CLOSE_DUPLICATE_WEB`, and the webapp test dispatches
  `4002` which the hook compares against its (currently mirrored) constant. A
  value change would fail one side's test. **Safe** (and A removes the mirror).
- **URL builders — MEDIUM.** The `/session/:id?client=pi|web` shape is built in
  two places (`relay-client.ts:85`, `useRelay.ts:129`) and parsed by an identical
  regex in two (`relay-server.ts:37`, `index.ts:154`). **There is no round-trip
  test** — the relay tests dial hardcoded paths, never via the client builder.
  `lessons.md` carries a rule that client/server URL formats "must match exactly"
  and to "test the full round-trip." Centralizing the builder without that test
  risks a silent connection failure.

---

## Minimum characterization tests before each refactor

> These are **inputs to the spec tickets' resolutions** (0031, 0032), not
> decisions. Whether to author them as a gated "write-tests-first" step or
> characterize-then-extract in one pass is a decision for those tickets. The
> tests themselves are authored during implementation (the handoff).

### Before **0032** (B — relay policy extraction) — hard gate

Characterize against the **dev relay** (`relay-server.ts`), then require the
same assertions to pass **unchanged** against the extracted `RelaySession`:

1. **Forwarding** — pi+web connected; pi sends `{type:"user_message",…}` → web
   receives it byte-identical; web sends `{type:"assistant_delta",…}` → pi
   receives it byte-identical. Cover ≥2 message types each direction.
2. **`peer_connected` fanout** — web dials first → web receives
   `{type:"peer_disconnected",peer:"pi"}` (no peer yet); pi dials → web receives
   `{type:"peer_connected",peer:"pi"}` **and** pi receives
   `{type:"peer_connected",peer:"web"}`. Pin the exact ordering/messages the code
   emits today.
3. **close→notify + cleanup** — both connected; pi closes → web receives
   `{type:"peer_disconnected",peer:"pi"}`; and when both are gone the session is
   reaped (assert a fresh client can reclaim the id, or `sessions.size`).

The existing single-tab + heartbeat + `isOpen` tests already cover the rest of
the policy and carry over directly.

### Before **0031** (D — typed command wire-change) — hard gate

Characterize **`handlePiCommand`** (`extension/index.ts:81`) with a mock
`ctx`/`pi`, one assertion per current branch:

1. `model anthropic/claude-sonnet-4-5` — found + `setModel` true → notify
   "Switched to…"; `setModel` false → notify "No API key"; not found → notify
   "Model not found"; missing `/` → notify usage.
2. `compact` → `ctx.compact()` called + notify "Compacting…".
3. `skill:research do a thing` → `pi.sendMessage` with the skill command
   (`customType:"web-skill-command"`, `content:"/skill:research do a thing"`,
   `triggerTurn:true`); `skill:research` (no args) likewise.
4. unknown `foo bar` → `pi.sendUserMessage("/foo bar")`.

These lock the parse→action map so the discriminated-union version can be proven
equivalent.

### Before **0029 / 0030** (A — protocol package) — recommended, not gated

1. **URL round-trip** — assert a `buildSessionWsUrl(relayUrl, id, "pi")` produces
   a path the relay's `/^\/session\/([^/]+)$/` + `?client=` parse accepts
   (sessionId=id, client=pi); same for `"web"`. Pin the exact string. Retires the
   `lessons.md` URL-mismatch risk before the builder moves.

---

## Verdict

- **A is safe to start now** (types/close-codes are low-risk and already
  indirectly pinned); add the URL round-trip test as the one recommended pre-step.
- **B and D are not yet safe** — their core behavior is uncharacterized. They
  remain blocked-by this audit (now closing); their resolutions (0031, 0032)
  must adopt the minimum-tests-before lists above as the gate that makes each a
  behavior-preserving refactor rather than a rewrite.
- The production `SessionDO` gap is real and is ticket **0033**'s to resolve.