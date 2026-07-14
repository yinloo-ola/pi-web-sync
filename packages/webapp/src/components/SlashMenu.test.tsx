import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlashMenu, PI_COMMANDS } from "./SlashMenu";
import type { ModelInfo, SkillInfo, PromptInfo } from "../hooks/useRelay";

const EMPTY_MODELS: ModelInfo[] = [];
const EMPTY_SKILLS: SkillInfo[] = [];

const SAMPLE_MODELS: ModelInfo[] = [
  { id: "claude-sonnet-4-5", provider: "anthropic", name: "Claude Sonnet 4.5" },
  { id: "gpt-4o", provider: "openai", name: "GPT-4o" },
  { id: "gemini-2.0-flash", provider: "google", name: "Gemini 2.0 Flash" },
];

const SAMPLE_PROMPTS: PromptInfo[] = [
  { name: "review", description: "Review changes", argumentHint: "<files>" },
  { name: "summarize", description: "Summarize state" },
  { name: "diagnose", description: "Debug bugs" },
];

const SAMPLE_SKILLS: SkillInfo[] = [
  { name: "research", description: "Research a topic", source: "skill" },
  { name: "diagnose", description: "Debug hard bugs", source: "skill" },
  { name: "tdd", description: "Test-driven development", source: "skill" },
];

function renderSlashMenu(props: Partial<Parameters<typeof SlashMenu>[0]> = {}) {
  const defaults = {
    input: "/",
    availableModels: EMPTY_MODELS,
    availableSkills: EMPTY_SKILLS,
    availablePrompts: [] as PromptInfo[],
    onSelect: vi.fn(),
    onFillInput: vi.fn(),
    onDismiss: vi.fn(),
  };
  return render(<SlashMenu {...defaults} {...props} />);
}

describe("SlashMenu", () => {
  it("renders all commands when input is just `/`", () => {
    renderSlashMenu({ input: "/" });

    expect(screen.getByTestId("slash-menu")).toBeDefined();
    PI_COMMANDS.forEach((cmd) => {
      expect(screen.getByTestId(`slash-item-${cmd.name}`)).toBeDefined();
    });
  });

  it("filters commands by prefix", () => {
    renderSlashMenu({ input: "/mo" });

    expect(screen.getByTestId("slash-item-model")).toBeDefined();
    expect(screen.queryByTestId("slash-item-skill")).toBeNull();
    expect(screen.queryByTestId("slash-item-compact")).toBeNull();
  });

  it("returns null when no commands match", () => {
    const { container } = renderSlashMenu({ input: "/xyz" });

    expect(container.innerHTML).toBe("");
  });

  it("sends model command immediately when clicked", () => {
    const onSelect = vi.fn();
    renderSlashMenu({
      input: "/",
      availableModels: SAMPLE_MODELS,
      onSelect,
    });

    fireEvent.click(screen.getByTestId("slash-item-model"));
    fireEvent.click(screen.getByTestId("slash-model-anthropic-claude-sonnet-4-5"));

    expect(onSelect).toHaveBeenCalledWith("/model anthropic/claude-sonnet-4-5");
  });

  it("calls onDismiss when Escape is pressed", () => {
    const onDismiss = vi.fn();
    renderSlashMenu({ input: "/", onDismiss });

    fireEvent.keyDown(screen.getByTestId("slash-menu"), { key: "Escape" });

    expect(onDismiss).toHaveBeenCalled();
  });

  it("shows model submenu when pressing Enter on model command", () => {
    const onSelect = vi.fn();
    renderSlashMenu({
      input: "/",
      availableModels: SAMPLE_MODELS,
      onSelect,
    });

    // Enter on model (first item) should show submenu
    fireEvent.keyDown(screen.getByTestId("slash-menu"), { key: "Enter" });

    // Should now show model submenu
    expect(screen.getByTestId("slash-model-anthropic-claude-sonnet-4-5")).toBeDefined();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("navigates with ArrowDown and ArrowUp", () => {
    const onFillInput = vi.fn();
    renderSlashMenu({ input: "/", onFillInput });

    // ArrowDown to skill, then Enter
    fireEvent.keyDown(screen.getByTestId("slash-menu"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByTestId("slash-menu"), { key: "Enter" });

    // Skill command should show submenu
    expect(screen.getByTestId("slash-menu")).toBeDefined();
    expect(onFillInput).not.toHaveBeenCalled();
  });

  it("is case-insensitive when filtering", () => {
    renderSlashMenu({ input: "/MO" });

    expect(screen.getByTestId("slash-item-model")).toBeDefined();
  });

  describe("model submenu", () => {
    it("shows model submenu when /model is selected", () => {
      renderSlashMenu({
        input: "/model ",
        availableModels: SAMPLE_MODELS,
      });

      expect(screen.getByTestId("slash-menu")).toBeDefined();
      expect(screen.getByTestId("slash-model-anthropic-claude-sonnet-4-5")).toBeDefined();
      expect(screen.getByTestId("slash-model-openai-gpt-4o")).toBeDefined();
      expect(screen.getByTestId("slash-model-google-gemini-2.0-flash")).toBeDefined();
    });

    it("filters models by query", () => {
      renderSlashMenu({
        input: "/model cla",
        availableModels: SAMPLE_MODELS,
      });

      expect(screen.getByTestId("slash-model-anthropic-claude-sonnet-4-5")).toBeDefined();
      expect(screen.queryByTestId("slash-model-openai-gpt-4o")).toBeNull();
    });

    it("sends model command immediately when clicked in submenu", () => {
      const onSelect = vi.fn();
      renderSlashMenu({
        input: "/model ",
        availableModels: SAMPLE_MODELS,
        onSelect,
      });

      fireEvent.click(screen.getByTestId("slash-model-anthropic-claude-sonnet-4-5"));

      expect(onSelect).toHaveBeenCalledWith("/model anthropic/claude-sonnet-4-5");
    });

    it("shows 'No models available' when models list is empty", () => {
      renderSlashMenu({ input: "/model " });

      expect(screen.getByText("No models available")).toBeDefined();
    });

    it("goes back to commands when clicking 'Back to commands'", () => {
      renderSlashMenu({
        input: "/model ",
        availableModels: SAMPLE_MODELS,
      });

      fireEvent.click(screen.getByText("← Back to commands"));

      // Should show main command menu again
      expect(screen.getByTestId("slash-item-model")).toBeDefined();
    });

    it("shows model count in command description", () => {
      renderSlashMenu({
        input: "/",
        availableModels: SAMPLE_MODELS,
      });

      expect(screen.getByText("Switch the active model (3 available)")).toBeDefined();
    });
  });

  describe("skill submenu", () => {
    it("shows skill submenu when /skill is selected", () => {
      renderSlashMenu({
        input: "/skill ",
        availableSkills: SAMPLE_SKILLS,
      });

      expect(screen.getByTestId("slash-menu")).toBeDefined();
      expect(screen.getByTestId("slash-skill-research")).toBeDefined();
      expect(screen.getByTestId("slash-skill-diagnose")).toBeDefined();
      expect(screen.getByTestId("slash-skill-tdd")).toBeDefined();
    });

    it("filters skills by query", () => {
      renderSlashMenu({
        input: "/skill res",
        availableSkills: SAMPLE_SKILLS,
      });

      expect(screen.getByTestId("slash-skill-research")).toBeDefined();
      expect(screen.queryByTestId("slash-skill-diagnose")).toBeNull();
    });

    it("fills input with skill command for appending instructions", () => {
      const onFillInput = vi.fn();
      renderSlashMenu({
        input: "/skill ",
        availableSkills: SAMPLE_SKILLS,
        onFillInput,
      });

      fireEvent.click(screen.getByTestId("slash-skill-research"));

      expect(onFillInput).toHaveBeenCalledWith("/skill:research ");
    });

    it("shows 'No skills available' when skills list is empty", () => {
      renderSlashMenu({ input: "/skill " });

      expect(screen.getByText("No skills available")).toBeDefined();
    });

    it("shows skill count in command description", () => {
      renderSlashMenu({
        input: "/",
        availableSkills: SAMPLE_SKILLS,
      });

      expect(screen.getByText("Run a skill by name (3 available)")).toBeDefined();
    });
  });

  describe("prompt submenu", () => {
    it("shows prompt command in the main menu", () => {
      renderSlashMenu({ input: "/" });

      expect(screen.getByTestId("slash-item-prompt")).toBeDefined();
    });

    it("shows prompt submenu when /prompt is selected", () => {
      renderSlashMenu({
        input: "/prompt ",
        availablePrompts: SAMPLE_PROMPTS,
      });

      expect(screen.getByTestId("slash-menu")).toBeDefined();
      expect(screen.getByTestId("slash-prompt-review")).toBeDefined();
      expect(screen.getByTestId("slash-prompt-summarize")).toBeDefined();
      expect(screen.getByTestId("slash-prompt-diagnose")).toBeDefined();
    });

    it("filters prompts by query", () => {
      renderSlashMenu({
        input: "/prompt rev",
        availablePrompts: SAMPLE_PROMPTS,
      });

      expect(screen.getByTestId("slash-prompt-review")).toBeDefined();
      expect(screen.queryByTestId("slash-prompt-summarize")).toBeNull();
    });

    it("fills input with the prompt command for appending arguments", () => {
      const onFillInput = vi.fn();
      renderSlashMenu({
        input: "/prompt ",
        availablePrompts: SAMPLE_PROMPTS,
        onFillInput,
      });

      fireEvent.click(screen.getByTestId("slash-prompt-review"));

      expect(onFillInput).toHaveBeenCalledWith("/review ");
    });

    it("shows 'No prompts available' when prompts list is empty", () => {
      renderSlashMenu({ input: "/prompt " });

      expect(screen.getByText("No prompts available")).toBeDefined();
    });

    it("shows prompt count in command description", () => {
      renderSlashMenu({
        input: "/",
        availablePrompts: SAMPLE_PROMPTS,
      });

      expect(screen.getByText("Send a prompt template (3 available)")).toBeDefined();
    });

    it("shows argument hint when present", () => {
      renderSlashMenu({
        input: "/prompt ",
        availablePrompts: SAMPLE_PROMPTS,
      });

      expect(screen.getByText("<files>")).toBeDefined();
    });
  });

  describe("command entry removed (ticket 0052)", () => {
    it("does NOT render the /command entry in the main menu", () => {
      renderSlashMenu({ input: "/" });

      expect(screen.queryByTestId("slash-item-command")).toBeNull();
    });

    it("does NOT show a command submenu even when commands are available", () => {
      renderSlashMenu({ input: "/command " });

      // No submenu items, no back link — typing /command yields no menu.
      expect(screen.queryByTestId("slash-menu")).toBeNull();
      expect(screen.queryByTestId("slash-command-web-sync")).toBeNull();
    });
  });
});