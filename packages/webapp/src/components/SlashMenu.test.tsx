import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlashMenu, PI_COMMANDS } from "./SlashMenu";

describe("SlashMenu", () => {
  it("renders all commands when input is just `/`", () => {
    render(<SlashMenu input="/" onSelect={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByTestId("slash-menu")).toBeDefined();
    PI_COMMANDS.forEach((cmd) => {
      expect(screen.getByTestId(`slash-item-${cmd.name}`)).toBeDefined();
    });
  });

  it("filters commands by prefix", () => {
    render(<SlashMenu input="/mo" onSelect={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByTestId("slash-item-model")).toBeDefined();
    expect(screen.queryByTestId("slash-item-skill")).toBeNull();
    expect(screen.queryByTestId("slash-item-compact")).toBeNull();
  });

  it("returns null when no commands match", () => {
    const { container } = render(
      <SlashMenu input="/xyz" onSelect={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("calls onSelect when a command is clicked", () => {
    const onSelect = vi.fn();
    render(<SlashMenu input="/" onSelect={onSelect} onDismiss={vi.fn()} />);

    fireEvent.click(screen.getByTestId("slash-item-model"));

    expect(onSelect).toHaveBeenCalledWith("model");
  });

  it("calls onDismiss when Escape is pressed", () => {
    const onDismiss = vi.fn();
    render(<SlashMenu input="/" onSelect={vi.fn()} onDismiss={onDismiss} />);

    fireEvent.keyDown(screen.getByTestId("slash-menu"), { key: "Escape" });

    expect(onDismiss).toHaveBeenCalled();
  });

  it("calls onSelect with Enter key", () => {
    const onSelect = vi.fn();
    render(<SlashMenu input="/" onSelect={onSelect} onDismiss={vi.fn()} />);

    fireEvent.keyDown(screen.getByTestId("slash-menu"), { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith("model"); // first item
  });

  it("navigates with ArrowDown and ArrowUp", () => {
    const onSelect = vi.fn();
    render(<SlashMenu input="/" onSelect={onSelect} onDismiss={vi.fn()} />);

    // ArrowDown twice to get to the third item (compact)
    fireEvent.keyDown(screen.getByTestId("slash-menu"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByTestId("slash-menu"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByTestId("slash-menu"), { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith("compact");
  });

  it("is case-insensitive when filtering", () => {
    render(<SlashMenu input="/MO" onSelect={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByTestId("slash-item-model")).toBeDefined();
  });
});