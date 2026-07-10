# Changelog

## [Unreleased]

### Added

- Pi extension (`packages/extension`) — hooks into pi events and relays messages via WebSocket
- Cloudflare Worker relay (`packages/relay`) — pairs pi and web clients per session ID using Durable Objects
- React + Vite web app (`packages/webapp`) — displays conversation with markdown rendering, localStorage persistence
- Command-based connection: `/web-sync connect`, `/web-sync disconnect` via `pi.registerCommand`
- Peer connection notifications — web app shows when pi is connected/disconnected
- Session ID shared between pi and web-sync — uses pi's session ID as the shared secret
- `sync_request` on web app connect — requests full conversation history from pi
- Markdown rendering with tables (`react-markdown` + `remark-gfm`)
- `docs/lessons.md` — project-specific learnings

### Fixed

- URL format mismatch between clients and relay — both now use `/session/<id>?client=<type>`
- Web app sends `sync_request` on WebSocket open (was silently missing)
- Use `web-sync` instead of `/web-sync` to avoid pi command interception
- Use `ctx.ui.notify` instead of `pi.ui.notify` — `ui` is only on event context, not `ExtensionAPI`
- Use `/web-sync` command prefix with `action:stop` to prevent LLM interception
- Relay sends text frames (not Buffer), web app handles Blob data
- Use `input` event for user messages with buffering and error handling
- Accept any session ID, not just hex characters
- Isolate `@cloudflare/workers-types` to relay package only
- Use `base: /` in vite config for correct asset paths on Cloudflare Pages
- Remove stale `packages/_ptk/stub.ts` scaffold artifact

### Changed

- Refactored from simple Worker to Durable Objects for maintaining WebSocket state
- Restructured README into two sections: end-user quick start and developer self-hosting guide
- Archived planning docs to `docs/plans/completed/`
- Extension now reads config from `~/.pi-web-sync.json` (global) or `.pi-web-sync.json` (project) before falling back to env vars
- Removed hardcoded default relay/webapp URLs — users must self-host or provide URLs explicitly
- Updated `.gitignore` to cover `.vite/`, `.wrangler/`, IDE and OS files
- Added `README.md` and `repository` field to extension's npm package
- Added `CHANGELOG.md`