import { describe, it, expect, vi, beforeEach } from "vitest";
import { handlePiCommand } from "./command-handler";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/** Create a mock ExtensionAPI (pi) with just the methods handlePiCommand uses. */
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

/** Create a mock ExtensionCommandContext (ctx) with just the methods handlePiCommand uses. */
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

// ---------------------------------------------------------------------------
// Shared fake RelayClient & sessionId (unused by the handler today)
// ---------------------------------------------------------------------------

const fakeClient = {} as any;
const fakeSessionId = "sess-123";

// ---------------------------------------------------------------------------
// Characterization tests
// ---------------------------------------------------------------------------

describe("handlePiCommand — characterization of current string-based handler", () => {
  let pi: ExtensionAPI;
  let ctx: ExtensionCommandContext;

  beforeEach(() => {
    pi = createMockPi();
    ctx = createMockCtx();
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. Model command — well-formed "model provider/id"
  // -----------------------------------------------------------------------
  describe("model command", () => {
    it("calls setModel and notifies 'Switched to …' when the model is found and API key available", async () => {
      const fakeModel = { id: "claude-sonnet-4-5", provider: "anthropic", name: "Claude Sonnet 4.5" };
      (ctx.modelRegistry.find as ReturnType<typeof vi.fn>).mockReturnValue(fakeModel);
      (pi.setModel as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await handlePiCommand(pi, ctx, "model anthropic/claude-sonnet-4-5", fakeClient, fakeSessionId);

      expect(ctx.modelRegistry.find).toHaveBeenCalledWith("anthropic", "claude-sonnet-4-5");
      expect(pi.setModel).toHaveBeenCalledWith(fakeModel);
      expect(ctx.ui.notify).toHaveBeenCalledWith("Switched to Claude Sonnet 4.5", "info");
    });

    it("notifies 'No API key for …' when setModel returns false", async () => {
      const fakeModel = { id: "gpt-4o", provider: "openai", name: "GPT-4o" };
      (ctx.modelRegistry.find as ReturnType<typeof vi.fn>).mockReturnValue(fakeModel);
      (pi.setModel as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await handlePiCommand(pi, ctx, "model openai/gpt-4o", fakeClient, fakeSessionId);

      expect(ctx.modelRegistry.find).toHaveBeenCalledWith("openai", "gpt-4o");
      expect(pi.setModel).toHaveBeenCalledWith(fakeModel);
      expect(ctx.ui.notify).toHaveBeenCalledWith("No API key for openai/gpt-4o", "error");
    });

    it("notifies 'Model not found: …' when modelRegistry.find returns null/undefined", async () => {
      (ctx.modelRegistry.find as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      await handlePiCommand(pi, ctx, "model unknown/foo-bar", fakeClient, fakeSessionId);

      expect(ctx.modelRegistry.find).toHaveBeenCalledWith("unknown", "foo-bar");
      expect(pi.setModel).not.toHaveBeenCalled();
      expect(ctx.ui.notify).toHaveBeenCalledWith("Model not found: unknown/foo-bar", "error");
    });

    it("notifies usage error when provider/id is malformed (no slash)", async () => {
      await handlePiCommand(pi, ctx, "model nomodelname", fakeClient, fakeSessionId);

      expect(ctx.modelRegistry.find).not.toHaveBeenCalled();
      expect(pi.setModel).not.toHaveBeenCalled();
      expect(ctx.ui.notify).toHaveBeenCalledWith("Usage: /model provider/model-id", "error");
    });

    it("notifies usage error when slash is at position 0 (empty provider)", async () => {
      await handlePiCommand(pi, ctx, "model /model-id", fakeClient, fakeSessionId);

      expect(ctx.modelRegistry.find).not.toHaveBeenCalled();
      expect(ctx.ui.notify).toHaveBeenCalledWith("Usage: /model provider/model-id", "error");
    });

    it("falls through to unknown when 'model' has no args", async () => {
      await handlePiCommand(pi, ctx, "model", fakeClient, fakeSessionId);

      // "model" with no args does not match `cmd === "model" && args` (args is empty)
      expect(ctx.modelRegistry.find).not.toHaveBeenCalled();
      expect(pi.sendUserMessage).toHaveBeenCalledWith("/model");
    });
  });

  // -----------------------------------------------------------------------
  // 2. Compact command
  // -----------------------------------------------------------------------
  describe("compact command", () => {
    it("calls ctx.compact() and notifies 'Compacting…'", async () => {
      await handlePiCommand(pi, ctx, "compact", fakeClient, fakeSessionId);

      expect(ctx.compact).toHaveBeenCalledOnce();
      expect(ctx.ui.notify).toHaveBeenCalledWith("Compacting...", "info");
      expect(pi.setModel).not.toHaveBeenCalled();
      expect(pi.sendMessage).not.toHaveBeenCalled();
      expect(pi.sendUserMessage).not.toHaveBeenCalled();
    });

    it("ignores trailing whitespace after 'compact'", async () => {
      await handlePiCommand(pi, ctx, "compact ", fakeClient, fakeSessionId);

      expect(ctx.compact).toHaveBeenCalledOnce();
      expect(ctx.ui.notify).toHaveBeenCalledWith("Compacting...", "info");
    });
  });

  // -----------------------------------------------------------------------
  // 3. Skill commands — "skill:name" with and without args
  // -----------------------------------------------------------------------
  describe("skill command", () => {
    it("sends a skill with args via pi.sendMessage (customType: web-skill-command)", async () => {
      await handlePiCommand(pi, ctx, "skill:research do a thing", fakeClient, fakeSessionId);

      expect(pi.sendMessage).toHaveBeenCalledWith({
        customType: "web-skill-command",
        content: "/skill:research do a thing",
        display: false,
      }, {
        triggerTurn: true,
      });
      expect(pi.sendUserMessage).not.toHaveBeenCalled();
      expect(ctx.ui.notify).not.toHaveBeenCalled();
    });

    it("sends a skill without args via pi.sendMessage (customType: web-skill-command)", async () => {
      await handlePiCommand(pi, ctx, "skill:research", fakeClient, fakeSessionId);

      expect(pi.sendMessage).toHaveBeenCalledWith({
        customType: "web-skill-command",
        content: "/skill:research",
        display: false,
      }, {
        triggerTurn: true,
      });
      expect(pi.sendUserMessage).not.toHaveBeenCalled();
    });

    it("preserves the full command string (including args) in the content", async () => {
      await handlePiCommand(pi, ctx, "skill:diagnose this bug is weird", fakeClient, fakeSessionId);

      expect(pi.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "/skill:diagnose this bug is weird",
        }),
        expect.any(Object),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 4. Unknown commands — fall through to sendUserMessage
  // -----------------------------------------------------------------------
  describe("unknown command", () => {
    it("sends unknown command as a user message with / prefix", async () => {
      await handlePiCommand(pi, ctx, "foo bar", fakeClient, fakeSessionId);

      expect(pi.sendUserMessage).toHaveBeenCalledWith("/foo bar");
      expect(pi.sendMessage).not.toHaveBeenCalled();
      expect(ctx.compact).not.toHaveBeenCalled();
    });

    it("sends a bare unknown command as a user message with / prefix", async () => {
      await handlePiCommand(pi, ctx, "foo", fakeClient, fakeSessionId);

      expect(pi.sendUserMessage).toHaveBeenCalledWith("/foo");
    });

    it("sends 'model' (no args) as a user message via the unknown fallback", async () => {
      // "model" without args does not match `cmd === "model" && args`
      await handlePiCommand(pi, ctx, "model", fakeClient, fakeSessionId);

      expect(pi.sendUserMessage).toHaveBeenCalledWith("/model");
    });

    it("sends 'model provider/' (empty model ID) through the normal find path", async () => {
      // slash > 0 is true, so it calls modelRegistry.find("provider", "")
      (ctx.modelRegistry.find as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      await handlePiCommand(pi, ctx, "model provider/", fakeClient, fakeSessionId);

      expect(ctx.modelRegistry.find).toHaveBeenCalledWith("provider", "");
      expect(ctx.ui.notify).toHaveBeenCalledWith("Model not found: provider/", "error");
    });
  });
});