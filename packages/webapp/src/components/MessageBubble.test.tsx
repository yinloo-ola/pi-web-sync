import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "../types";

function makeMessage(role: "user" | "assistant", text: string): ChatMessage {
  return { id: "m1", role, text, timestamp: 1 };
}

describe("MessageBubble", () => {
  it("renders a user message", () => {
    render(<MessageBubble message={makeMessage("user", "hello")} />);
    expect(screen.getByText("hello")).toBeDefined();
  });

  it("renders an assistant message", () => {
    render(<MessageBubble message={makeMessage("assistant", "hi there")} />);
    expect(screen.getByText("hi there")).toBeDefined();
  });

  it("sets overflow-wrap on the bubble", () => {
    render(<MessageBubble message={makeMessage("assistant", "hello")} />);
    const bubble = document.querySelector(".message-bubble") as HTMLDivElement;
    expect(bubble).toBeDefined();
    expect(bubble.style.overflowWrap).toBe("break-word");
  });

  it("renders a markdown table", () => {
    const text = [
      "| Column A | Column B | Column C |",
      "| --- | --- | --- |",
      "| alpha | bravo | charlie |",
    ].join("\n");

    render(<MessageBubble message={makeMessage("assistant", text)} />);
    expect(screen.getByRole("table")).toBeDefined();
  });

  it("renders a markdown image", () => {
    render(<MessageBubble message={makeMessage("assistant", "![an image](http://example.com/img.png)")} />);
    expect(screen.getByRole("img")).toBeDefined();
  });

  it("renders a markdown code block", () => {
    render(
      <MessageBubble
        message={makeMessage("assistant", "```\nconst x = 1;\n```")}
      />,
    );
    expect(document.querySelector(".message-bubble pre")).toBeDefined();
  });
});