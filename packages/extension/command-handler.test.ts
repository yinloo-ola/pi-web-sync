import { describe, it, expect, vi, beforeEach } from "vitest";
import { handlePiCommand } from "./command-handler";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { parsePiCommand } from "pi-web-sync-protocol";
import type { PiCommand } from "pi-web-sync-protocol";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockPi(overrides?: Partial<{
  setModel: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  sendUserMessage: ReturnType<typeof vi.fn>;
}>): ExtensionAPI {
  return {
    setModel: overrides?.setModel ?? vi.fn().mockResolvedValue(true),
    sendMessage: overrides?.sendMessage ?? vi.fn(),
    sendUserMessage: overrides?.sendUserMessage ?? vi.fn(),
  } as unknown as ExtensionAPI;
}

function createMockCtx(overrides?: Partial<{
  compact: ReturnType<typeof vi.fn>;
  ui: { notify: ReturnType<typeof vi.fn> };
  modelRegistry: { find: ReturnType<typeof vi.fn> };
}>): ExtensionCommandContext {
  return {
    compact: overrides?.compact ?? vi.fn(),
    ui: { notify: overrides?.ui?.notify ?? vi.fn() },
    modelRegistry: {
      find: overrides?.modelRegistry?.find ?? vi.fn(),
    },
  } as unknown as ExtensionCommandContext;
}

const fakeClient = {} as any;
const fakeSessionId = "sess-123";

/**
 * Parse a command string via `parsePiCommand` and pass the result to
 * `handlePiCommand`. This asserts coherence between the parser and
 * handler — the same path the web app uses.
 */
async function parseAndHandle(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  commandStr: string,
): Promise<void> {
  const parsed = parsePiCommand(commandStr);
  await handlePiCommand(pi, ctx, parsed as PiCommand, fakeClient, fakeSessionId);
}

// ---------------------------------------------------------------------------
// Characterization tests
//
// Each branch of the current command handler is characterized by the
// pi-API effect it triggers. The string parsing has moved upstream to
// `parsePiCommand` in the web app; the handler now matches on `kind`.
//
// Two styles prove equivalence:
//   A) parsePiCommand(string) → handlePiCommand  (end-to-end, like the web app)
//   B) Direct PiCommand value → handlePiCommand   (pure handler unit test)
//
// Both must agree with the original string-handler characterization
// (ticket #0037) for parseable commands. Unparseable commands no
// longer reach the handler — they are sent as user messages by the
// web app.
// -----------------------------------------------------------------------

// -----------------------------------------------------------------------
// Command contracts (ticket 0050) — what each typed PiCommand must produce.
// These are the behaviours ticket 0052 must keep green.
//
//   model   → ctx.modelRegistry.find(provider,id) → pi.setModel(model) → notify
//   compact → ctx.compact() → notify "Compacting..."
//   skill   → pi.sendMessage({ customType:"web-skill-command",
//                             content:"/skill:<name> [<args>]", display:false },
//                           { triggerTurn:true })
//             (skill *loading* is model-driven — the model reads SKILL.md
//              itself; not asserted here, manual verification only)
//   prompt  → parsePiCommand(input, promptNames) recognizes bare prompt
//             names → expand via local prompts.ts → pi.sendUserMessage(expanded)
//             (unmatched / no templates → sendUserMessage of raw "/<name> [<args>]";
//              unknown bare name → null → ordinary user_message)
// -----------------------------------------------------------------------
describe("handlePiCommand — characterization (D: typed PiCommand)", () => {
  let pi: ExtensionAPI;
  let ctx: ExtensionCommandContext;

  beforeEach(() => {
    pi = createMockPi();
    ctx = createMockCtx();
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. Model command
  // -----------------------------------------------------------------------
  describe("model command", () => {
    const modelCmd: PiCommand = { kind: "model", provider: "anthropic", id: "claude-sonnet-4-5" };

    it("[A] via parsePiCommand: calls setModel and notifies 'Switched to …'", async () => {
      const fakeModel = { id: "claude-sonnet-4-5", provider: "anthropic", name: "Claude Sonnet 4.5" };
      (ctx.modelRegistry.find as ReturnType<typeof vi.fn>).mockReturnValue(fakeModel);
      (pi.setModel as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await parseAndHandle(pi, ctx, "model anthropic/claude-sonnet-4-5");

      expect(ctx.modelRegistry.find).toHaveBeenCalledWith("anthropic", "claude-sonnet-4-5");
      expect(pi.setModel).toHaveBeenCalledWith(fakeModel);
      expect(ctx.ui.notify).toHaveBeenCalledWith("Switched to Claude Sonnet 4.5", "info");
    });

    it("[B] via direct PiCommand: calls setModel and notifies 'Switched to …'", async () => {
      const fakeModel = { id: "claude-sonnet-4-5", provider: "anthropic", name: "Claude Sonnet 4.5" };
      (ctx.modelRegistry.find as ReturnType<typeof vi.fn>).mockReturnValue(fakeModel);
      (pi.setModel as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await handlePiCommand(pi, ctx, modelCmd, fakeClient, fakeSessionId);

      expect(ctx.modelRegistry.find).toHaveBeenCalledWith("anthropic", "claude-sonnet-4-5");
      expect(pi.setModel).toHaveBeenCalledWith(fakeModel);
      expect(ctx.ui.notify).toHaveBeenCalledWith("Switched to Claude Sonnet 4.5", "info");
    });

    it("notifies 'No API key for …' when setModel returns false", async () => {
      const fakeModel = { id: "gpt-4o", provider: "openai", name: "GPT-4o" };
      (ctx.modelRegistry.find as ReturnType<typeof vi.fn>).mockReturnValue(fakeModel);
      (pi.setModel as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await handlePiCommand(pi, ctx, { kind: "model", provider: "openai", id: "gpt-4o" }, fakeClient, fakeSessionId);

      expect(ctx.ui.notify).toHaveBeenCalledWith("No API key for openai/gpt-4o", "error");
    });

    it("notifies 'Model not found: …' when modelRegistry.find returns undefined", async () => {
      (ctx.modelRegistry.find as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      await parseAndHandle(pi, ctx, "model unknown/foo-bar");

      expect(pi.setModel).not.toHaveBeenCalled();
      expect(ctx.ui.notify).toHaveBeenCalledWith("Model not found: unknown/foo-bar", "error");
    });
  });

  // -----------------------------------------------------------------------
  // 2. Compact command
  // -----------------------------------------------------------------------
  describe("compact command", () => {
    it("calls ctx.compact() and notifies 'Compacting…'", async () => {
      await parseAndHandle(pi, ctx, "compact");

      expect(ctx.compact).toHaveBeenCalledOnce();
      expect(ctx.ui.notify).toHaveBeenCalledWith("Compacting...", "info");
      expect(pi.setModel).not.toHaveBeenCalled();
      expect(pi.sendMessage).not.toHaveBeenCalled();
      expect(pi.sendUserMessage).not.toHaveBeenCalled();
    });

    it("[B] via direct PiCommand: calls ctx.compact() and notifies 'Compacting…'", async () => {
      await handlePiCommand(pi, ctx, { kind: "compact" }, fakeClient, fakeSessionId);

      expect(ctx.compact).toHaveBeenCalledOnce();
      expect(ctx.ui.notify).toHaveBeenCalledWith("Compacting...", "info");
    });
  });

  // -----------------------------------------------------------------------
  // 3. Skill commands
  // -----------------------------------------------------------------------
  describe("skill command", () => {
    it("[A] sends skill with args via pi.sendMessage (customType: web-skill-command)", async () => {
      await parseAndHandle(pi, ctx, "skill:research do a thing");

      expect(pi.sendMessage).toHaveBeenCalledWith({
        customType: "web-skill-command",
        content: "/skill:research do a thing",
        display: false,
      }, { triggerTurn: true });
      expect(pi.sendUserMessage).not.toHaveBeenCalled();
      expect(ctx.ui.notify).not.toHaveBeenCalled();
    });

    it("[B] sends skill with args via pi.sendMessage", async () => {
      const cmd: PiCommand = { kind: "skill", name: "research", args: "do a thing" };
      await handlePiCommand(pi, ctx, cmd, fakeClient, fakeSessionId);

      expect(pi.sendMessage).toHaveBeenCalledWith({
        customType: "web-skill-command",
        content: "/skill:research do a thing",
        display: false,
      }, { triggerTurn: true });
    });

    it("[A] sends skill without args via pi.sendMessage", async () => {
      await parseAndHandle(pi, ctx, "skill:research");

      expect(pi.sendMessage).toHaveBeenCalledWith({
        customType: "web-skill-command",
        content: "/skill:research",
        display: false,
      }, { triggerTurn: true });
    });

    it("[B] sends skill without args via pi.sendMessage", async () => {
      const cmd: PiCommand = { kind: "skill", name: "research" };
      await handlePiCommand(pi, ctx, cmd, fakeClient, fakeSessionId);

      expect(pi.sendMessage).toHaveBeenCalledWith({
        customType: "web-skill-command",
        content: "/skill:research",
        display: false,
      }, { triggerTurn: true });
    });
  });

  // -----------------------------------------------------------------------
  // 3b. Prompt commands (current behaviour) — see CONTRACTS above.
  // Characterizes the EXTENSION handler only; the webapp routing that decides
  // whether a /prompt reaches here is fixed in ticket 0052.
  // -----------------------------------------------------------------------
  describe("prompt command (current behaviour)", () => {
    const commitTemplate = {
      name: "commit",
      description: "Create a commit",
      content: "Please create a commit with message: $@",
      filePath: "/prompts/commit.md",
    };

    it("expands a matching template (with args) and sendUserMessages the expanded text", async () => {
      await handlePiCommand(
        pi, ctx,
        { kind: "prompt", name: "commit", args: "fix the bug" },
        fakeClient, fakeSessionId,
        [commitTemplate],
      );
      expect(pi.sendUserMessage).toHaveBeenCalledWith("Please create a commit with message: fix the bug");
      expect(pi.sendMessage).not.toHaveBeenCalled();
    });

    it("expands a matching template (no args) with empty substitution", async () => {
      await handlePiCommand(
        pi, ctx,
        { kind: "prompt", name: "commit" },
        fakeClient, fakeSessionId,
        [commitTemplate],
      );
      expect(pi.sendUserMessage).toHaveBeenCalledWith("Please create a commit with message: ");
    });

    it("with NO matching template, sendUserMessages the raw slash text (current fallback)", async () => {
      await handlePiCommand(
        pi, ctx,
        { kind: "prompt", name: "commit", args: "fix the bug" },
        fakeClient, fakeSessionId,
        [],
      );
      expect(pi.sendUserMessage).toHaveBeenCalledWith("/commit fix the bug");
    });

    it("with NO templates supplied, sendUserMessages the raw slash text", async () => {
      await handlePiCommand(
        pi, ctx,
        { kind: "prompt", name: "commit" },
        fakeClient, fakeSessionId,
        undefined,
      );
      expect(pi.sendUserMessage).toHaveBeenCalledWith("/commit");
    });
  });

  // -----------------------------------------------------------------------
  // 4. Coherence: parsePiCommand → typed handler produces same effects
  // -----------------------------------------------------------------------
  describe("parsePiCommand → handler coherence", () => {
    it("model anthropic/claude-sonnet-4-5 → handler produces model-switch effects", async () => {
      const fakeModel = { id: "claude-sonnet-4-5", provider: "anthropic", name: "Claude Sonnet 4.5" };
      (ctx.modelRegistry.find as ReturnType<typeof vi.fn>).mockReturnValue(fakeModel);
      (pi.setModel as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const parsed = parsePiCommand("model anthropic/claude-sonnet-4-5")!;
      await handlePiCommand(pi, ctx, parsed, fakeClient, fakeSessionId);

      expect(pi.setModel).toHaveBeenCalledWith(fakeModel);
      expect(ctx.ui.notify).toHaveBeenCalledWith("Switched to Claude Sonnet 4.5", "info");
    });

    it("compact → handler produces compaction effects", async () => {
      const parsed = parsePiCommand("compact")!;
      await handlePiCommand(pi, ctx, parsed, fakeClient, fakeSessionId);

      expect(ctx.compact).toHaveBeenCalledOnce();
      expect(ctx.ui.notify).toHaveBeenCalledWith("Compacting...", "info");
    });

    it("skill:research do a thing → handler produces sendMessage call", async () => {
      const parsed = parsePiCommand("skill:research do a thing")!;
      await handlePiCommand(pi, ctx, parsed, fakeClient, fakeSessionId);

      expect(pi.sendMessage).toHaveBeenCalledWith({
        customType: "web-skill-command",
        content: "/skill:research do a thing",
        display: false,
      }, { triggerTurn: true });
    });

    // Ticket 0052: the full /prompt path — a bare prompt name (the form the
    // webapp slash menu sends) is parsed with the prompt-names set, then the
    // handler expands the template and delivers the EXPANDED body to pi (not
    // the raw "/commit"). This is the acceptance criterion for /prompt.
    it("bare prompt name + templates → expanded body reaches pi (ticket 0052)", async () => {
      const commitTemplate = {
        name: "commit",
        description: "Create a commit",
        content: "Please create a commit with message: $@",
        filePath: "/prompts/commit.md",
      };
      const parsed = parsePiCommand("commit fix the bug", ["commit"])!;
      await handlePiCommand(pi, ctx, parsed, fakeClient, fakeSessionId, [commitTemplate]);

      expect(parsed).toEqual({ kind: "prompt", name: "commit", args: "fix the bug" });
      expect(pi.sendUserMessage).toHaveBeenCalledWith(
        "Please create a commit with message: fix the bug",
      );
      expect(pi.sendUserMessage).not.toHaveBeenCalledWith("/commit fix the bug");
      expect(pi.sendMessage).not.toHaveBeenCalled();
    });
  });
});