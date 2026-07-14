# Protocol wire package: private workspace package, inline builder in the extension

The shared wire-protocol contract lives in a private workspace package,
`pi-web-sync-protocol`, that is **never published to npm**. The webapp and relay
depend on it as a normal workspace dependency (inlined at vite / wrangler build
time). The extension depends on it as a **type-only devDependency** (types are
erased at runtime by jiti, so ADR-003's no-build-step is untouched) and keeps its
own one-line inline WebSocket-URL builder, guarded by a characterization test.

**Context:** Candidate A extracts the wire contract — `RelayMessage` types, close
codes, the `/session/:id?client=` URL builder + parser, and the `PiCommand` union
home (ticket 0029) — into one module so it stops being smeared across packages.
The extension is the awkward consumer: it is published to npm (ADR-003) and runs
under jiti at the end user's machine with no build step, so any *runtime* value
it imports from the protocol package must be resolvable from the registry at
install time. The types are `import type` (erased — no runtime cost), but the URL
*builder* is a runtime function the extension needs (`relay-client.ts:85`).

**Decision:** Keep `pi-web-sync-protocol` private (workspace-only, never
published). The webapp and relay consume it normally (each bundler inlines it).
The extension consumes only the types (devDependency; erased by jiti) and keeps
its existing inline URL builder; a characterization test asserts that builder
produces a URL the relay's shared parser accepts, so the mirror is tested rather
than comment-held.

**Considered options:**

- **Publish `pi-web-sync-protocol` to npm**, extension takes it as a runtime
  dep. Rejected: adds a second package to publish, version-sync, and name-claim
  for the sake of one trivial function — against this project's self-hosted,
  minimal-infrastructure ethos.
- **`bundledDependencies`** — keep the package private and bundle it into the
  extension's npm tarball at publish. **Disproven:** `bundledDependencies` is
  broken with npm workspaces (deps hoist to the root `node_modules`, so
  `npm pack`/`publish` silently omit them) — open and unfixed across npm
  v8/v9/v10 ([npm/cli#3466](https://github.com/npm/cli/issues/3466),
  [#7137](https://github.com/npm/cli/issues/7137)).
- **Private + extension inlines a tested builder** — chosen.

**Why:** The extension needs exactly one runtime function from the package; the
webapp and relay already get full single-sourcing from the private package.
Keeping it private avoids publish/version-sync machinery, the inline builder is
already correct, and the characterization test (ticket 0029's gate) retires the
drift risk the whole effort exists to kill. The cost — the URL builder lives in
two places (package + extension) rather than ticket 0029's "exactly once" — is
one trivial, tested line, accepted deliberately. If the protocol package ever
grows runtime value the extension needs beyond this one function, revisit
(publish, or a build/bundle step that would now have to revisit ADR-003).