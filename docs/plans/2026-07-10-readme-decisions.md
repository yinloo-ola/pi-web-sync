# Decisions: pi-web-sync README

## Problem

The pi-web-sync project has no README at the repository root. New users — whether they're evaluating the extension, deploying the relay, or contributing to the monorepo — have no entry point to understand what the project does, how to set it up, or how the pieces fit together.

Key constraints:
- Three distinct packages (extension, relay, webapp) with different audiences
- Users may want just the extension, or the full stack
- No existing documentation beyond a decisions doc and verification report under `docs/plans/`
- Must cover installation, configuration, development, and deployment

## Approaches considered

- **Option A: User-First Quickstart** — Minimal architecture, jump straight to "install extension → deploy relay → open webapp". Pro: Gets users running fast. Con: Leaves curious readers without mental model.

- **Option B: Architecture-First Reference** — Opens with system diagram and message flow. Pro: Full mental model upfront. Con: Walls off quick-start readers.

- **Option C: Tiered** — Two-column "Quick Start" at the top, then deep-dive sections (Architecture → Setup per package → Configuration → Development → Deployment). Pro: Serves both audiences. Con: Slightly more maintenance.

**Chosen:** Option C — Tiered. This follows the pattern used by Vite, Next.js, and other modern tool docs: the impatient get running in 30 seconds; the curious scroll for the full picture.

## Decisions

### ADR-1: Tiered README structure

The README will have a compact Quick Start section first (3-5 steps to get running), then expand into architectural detail, per-package setup, configuration reference, development workflow, and deployment guide. This avoids alienating either audience.

### ADR-2: Architecture diagram first in the deep-dive

After Quick Start, the Architecture section will describe the three-component system (pi extension ↔ WebSocket relay ↔ web app) and the message flow, before per-package setup instructions. This mirrors how readers naturally learn: "what is the system" → "how do I set up each part".

### ADR-3: Per-package setup sections over one combined guide

Each package gets its own setup subsection (Extension, Relay, Webapp) rather than a single monolithic instruction block. Each subsection stands alone so users only read what's relevant to them.

## Structure outline

```
README.md
├── Logo / Title / Badges
├── Quick Start (3 numbered steps)
│   1. Install the extension
│   2. Deploy the relay + webapp
│   3. Open the session URL
├── Architecture
│   ├── System diagram (ASCII or Mermaid)
│   ├── Components table
│   └── Message flow description
├── Setup
│   ├── Extension (npm install, pi config, env vars)
│   ├── Relay (deploy to Cloudflare Workers)
│   └── Webapp (deploy to Cloudflare Pages)
├── Configuration (env vars reference)
├── Development (monorepo, npm workspaces, scripts)
├── Deployment (CI/CD notes)
└── License
```