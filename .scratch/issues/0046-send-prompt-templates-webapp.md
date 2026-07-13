---
id: 0046
title: "Send prompt templates from the webapp"
type: task
parent: 0043
blocked_by: []
assigned: agent
status: closed
triage: ready-for-agent
---

# 0046 — Send prompt templates from the webapp

## Question

How can users invoke pi prompt templates (`/name`) from the webapp without switching back to the pi terminal?

## Resolution

- Added `prompts_list` message type and `PromptInfo`/`PromptsListPayload` to `packages/protocol/src/index.ts`.
- Created `packages/extension/prompts.ts` that loads `.md` prompt templates from `~/.pi/agent/prompts` and `<cwd>/.pi/prompts` (project prompts gated by trust), parses frontmatter, and expands `/name [args]` using the same `$1`, `$@`, `${N:-default}`, `${@:N}`, `${@:N:L}` substitution rules as pi.
- Extended `packages/extension/index.ts` to send `prompts_list` on connect and on every `sync_request`, and to expand prompt templates before calling `pi.sendUserMessage` for `user_message` inputs.
- Extended `useRelay.ts`, `Chat.tsx`, and `SlashMenu.tsx` to receive and display prompt templates in a `/prompt` slash-menu submenu; selecting a prompt fills the input with `/<name> `.
- Added `packages/extension/prompts.test.ts`, updated `useRelay.test.ts`, and added prompt-submenu tests to `SlashMenu.test.tsx`.

## Problem

Prompt templates are loaded by pi from `~/.pi/agent/prompts/*.md` and `<project>/.pi/prompts/*.md`. In the terminal the user types `/name [args]` and pi expands the template before sending. The webapp has no awareness of prompt templates, so users cannot use them from the browser.

## Solution

1. The extension discovers available prompt templates and sends them to the webapp.
2. The webapp adds a `/prompt` slash-menu entry that lists templates.
3. Selecting a template fills the input with `/<name> `; the user can add arguments and send as a normal message.
4. The extension expands the template text (including argument substitution) before forwarding it to pi.

### Wire protocol additions

Add to `packages/protocol/src/index.ts`:

```ts
export type MessageType =
  // ...existing types
  | "prompts_list";

export interface PromptInfo {
  name: string;
  description: string;
  argumentHint?: string;
}

export interface PromptsListPayload {
  prompts: PromptInfo[];
}
```

### Extension changes

New module: `packages/extension/prompts.ts`

- `loadPromptTemplates(cwd: string, agentDir: string): PromptTemplate[]`
  - Reads `*.md` files from `agentDir/prompts` and `cwd/.pi/prompts` (skip project dir if project is not trusted).
  - Parses frontmatter with `parseFrontmatter` from `@earendil-works/pi-coding-agent`.
  - Returns `name` (filename without extension), `description` (frontmatter `description` or first non-empty body line), optional `argumentHint`, and `content` (body).
- `expandPromptTemplate(text: string, templates: PromptTemplate[]): string`
  - If `text` starts with `/` and matches a template name, parse the rest as bash-style arguments and substitute `$1`, `$2`, `$@`, `$ARGUMENTS`, `${N:-default}`, `${@:N}`, `${@:N:L}` exactly like pi.
  - Return the expanded text; if no match, return the original text.

Modify `packages/extension/index.ts`:

- On connect and on each `sync_request`, load templates and send `prompts_list`.
- In the `user_message` handler, call `expandPromptTemplate(text)` and pass the result to `pi.sendUserMessage()`.

### Webapp changes

- `packages/webapp/src/hooks/useRelay.ts`: handle `prompts_list`, expose `availablePrompts: PromptInfo[]`.
- `packages/webapp/src/components/Chat.tsx`: pass `availablePrompts` to `SlashMenu`.
- `packages/webapp/src/components/SlashMenu.tsx`:
  - Add `prompt` to `PI_COMMANDS` with description "Send a prompt template".
  - Show a submenu with available prompts, filtered by query.
  - Selecting a prompt calls `onFillInput('/<name> ')` (include trailing space so the user can type arguments).
  - Display `argumentHint` if present.

### Example flow

1. User has `~/.pi/agent/prompts/review.md`.
2. Webapp connects; receives `prompts_list` with `{ name: "review", description: "Review staged changes" }`.
3. User types `/prompt`, selects `review`.
4. Input becomes `/review `.
5. User adds args and submits.
6. Extension expands `/review` to the template body and calls `pi.sendUserMessage(expanded)`.

### Testing

- `prompts.ts` tests:
  - Load templates from a temporary directory.
  - Parse description from frontmatter and from body fallback.
  - Expand positional args, `$@`, `${N:-default}`, and slice syntax.
  - Return original text when template is not found.
- `useRelay.test.ts`:
  - Assert `prompts_list` updates `availablePrompts`.
- `SlashMenu.test.tsx`:
  - `/prompt` shows submenu.
  - Selecting a prompt fills input with `/<name> `.
- End-to-end:
  - Send `/review` from webapp and verify pi receives the expanded template text.

## Risks & trade-offs

- The extension re-implements argument substitution to match pi's behavior. This is a small amount of code but must stay in sync if pi's prompt syntax changes.
- Only prompt templates in the default global/project directories are discovered. Prompts from packages/themes or explicit `promptPaths` settings are out of scope for now.
- The project prompts directory is only read when `ctx.isProjectTrusted()` is true, mirroring pi's trust behavior.

## Out of scope

- Adding, editing, or deleting prompt templates from the webapp.
- Discovering prompt templates from `promptPaths` settings or package manifests.
- Supporting arbitrary slash-menu autocomplete for every prompt name at the top level (use the `/prompt` submenu).
- Storing prompt templates in localStorage or sending them back to pi as metadata.