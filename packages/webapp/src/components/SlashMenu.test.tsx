import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlashMenu, PI_COMMANDS } from "./SlashMenu";
import type { ModelInfo } from "../hooks/useRelay";

const EMPTY_MODELS: ModelInfo[] = [];

const SAMPLE_MODELS: ModelInfo[] = [
  { id: "claude-sonnet-4-5", provider: "anthropic", name: "Claude Sonnet 4.5" },
  { id: "gpt-4o", provider: "openai", name: "GPT-4o" },
  { id: "gemini-2.0-flash", provider: "google", name: "Gemini 2.0 Flash" },
];

describe("SlashMenu", () => {
  it("renders all commands when input is just `/`", () => {
    render(
      <SlashMenu input="/" availableModels={EMPTY_MODELS} onSelect={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(screen.getByTestId("slash-menu")).toBeDefined();
    PI_COMMANDS.forEach((cmd) => {
      expect(screen.getByTestId(`slash-item-${cmd.name}`)).toBeDefined();
    });
  });

  it("filters commands by prefix", () => {
    render(
      <SlashMenu input="/mo" availableModels={EMPTY_MODELS} onSelect={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(screen.getByTestId("slash-item-model")).toBeDefined();
    expect(screen.queryByTestId("slash-item-skill")).toBeNull();
    expect(screen.queryByTestId("slash-item-compact")).toBeNull();
  });

  it("returns null when no commands match", () => {
    const { container } = render(
      <SlashMenu input="/xyz" availableModels={EMPTY_MODELS} onSelect={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("calls onSelect when a command is clicked", () => {
    const onSelect = vi.fn();
    render(
      <SlashMenu input="/" availableModels={EMPTY_MODELS} onSelect={onSelect} onDismiss={vi.fn()} />,
    );

    fireEvent.click(screen.getByTestId("slash-item-compact"));

    expect(onSelect).toHaveBeenCalledWith("compact");
  });

  it("calls onDismiss when Escape is pressed", () => {
    const onDismiss = vi.fn();
    render(
      <SlashMenu input="/" availableModels={EMPTY_MODELS} onSelect={vi.fn()} onDismiss={onDismiss} />,
    );

    fireEvent.keyDown(screen.getByTestId("slash-menu"), { key: "Escape" });

    expect(onDismiss).toHaveBeenCalled();
  });

  it("calls onSelect with Enter key for non-model commands", () => {
    const onSelect = vi.fn();
    render(
      <SlashMenu input="/" availableModels={EMPTY_MODELS} onSelect={onSelect} onDismiss={vi.fn()} />,
    );

    // ArrowDown to skill, then Enter
    fireEvent.keyDown(screen.getByTestId("slash-menu"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByTestId("slash-menu"), { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith("skill");
  });

  it("shows model submenu when pressing Enter on model command", () => {
    const onSelect = vi.fn();
    render(
      <SlashMenu input="/" availableModels={SAMPLE_MODELS} onSelect={onSelect} onDismiss={vi.fn()} />,
    );

    // Enter on model (first item) should show submenu
    fireEvent.keyDown(screen.getByTestId("slash-menu"), { key: "Enter" });

    // Should now show model submenu
    expect(screen.getByTestId("slash-model-anthropic-claude-sonnet-4-5")).toBeDefined();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("navigates with ArrowDown and ArrowUp", () => {
    const onSelect = vi.fn();
    render(
      <SlashMenu input="/" availableModels={EMPTY_MODELS} onSelect={onSelect} onDismiss={vi.fn()} />,
    );

    // ArrowDown twice to get to the third item (compact)
    fireEvent.keyDown(screen.getByTestId("slash-menu"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByTestId("slash-menu"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByTestId("slash-menu"), { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith("compact");
  });

  it("is case-insensitive when filtering", () => {
    render(
      <SlashMenu input="/MO" availableModels={EMPTY_MODELS} onSelect={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(screen.getByTestId("slash-item-model")).toBeDefined();
  });

  describe("model submenu", () => {
    it("shows model submenu when /model is selected", () => {
      render(
        <SlashMenu
          input="/model "
          availableModels={SAMPLE_MODELS}
          onSelect={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );

      expect(screen.getByTestId("slash-menu")).toBeDefined();
      expect(screen.getByTestId("slash-model-anthropic-claude-sonnet-4-5")).toBeDefined();
      expect(screen.getByTestId("slash-model-openai-gpt-4o")).toBeDefined();
      expect(screen.getByTestId("slash-model-google-gemini-2.0-flash")).toBeDefined();
    });

    it("filters models by query", () => {
      render(
        <SlashMenu
          input="/model cla"
          availableModels={SAMPLE_MODELS}
          onSelect={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );

      expect(screen.getByTestId("slash-model-anthropic-claude-sonnet-4-5")).toBeDefined();
      expect(screen.queryByTestId("slash-model-openai-gpt-4o")).toBeNull();
    });

    it("sends model command with provider/id format", () => {
      const onSelect = vi.fn();
      render(
        <SlashMenu
          input="/model "
          availableModels={SAMPLE_MODELS}
          onSelect={onSelect}
          onDismiss={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByTestId("slash-model-anthropic-claude-sonnet-4-5"));

      expect(onSelect).toHaveBeenCalledWith("model anthropic/claude-sonnet-4-5");
    });

    it("shows 'No models available' when models list is empty", () => {
      render(
        <SlashMenu
          input="/model "
          availableModels={EMPTY_MODELS}
          onSelect={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );

      expect(screen.getByText("No models available")).toBeDefined();
    });

    it("goes back to commands when clicking 'Back to commands'", () => {
      render(
        <SlashMenu
          input="/model "
          availableModels={SAMPLE_MODELS}
          onSelect={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByText("← Back to commands"));

      // Should show main command menu again
      expect(screen.getByTestId("slash-item-model")).toBeDefined();
    });

    it("shows model count in command description", () => {
      render(
        <SlashMenu
          input="/"
          availableModels={SAMPLE_MODELS}
          onSelect={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );

      expect(screen.getByText("Switch the active model (3 available)")).toBeDefined();
    });
  });
});