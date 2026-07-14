import { describe, it, expect } from "vitest";
import { parsePiCommand } from "./pi-command";

describe("parsePiCommand", () => {
  describe("model command", () => {
    it("parses 'model <provider>/<id>'", () => {
      expect(parsePiCommand("model anthropic/claude-sonnet-4-5")).toEqual({
        kind: "model",
        provider: "anthropic",
        id: "claude-sonnet-4-5",
      });
    });

    it("rejects model without a slash in args", () => {
      expect(parsePiCommand("model")).toBeNull();
      expect(parsePiCommand("model nomodel")).toBeNull();
    });
  });

  describe("compact command", () => {
    it("parses 'compact' exactly", () => {
      expect(parsePiCommand("compact")).toEqual({ kind: "compact" });
    });

    it("accepts compact with trailing whitespace (same as current handler)", () => {
      // Current handler: cmd === "compact" (no args check)
      expect(parsePiCommand("compact ")).toEqual({ kind: "compact" });
    });
  });

  describe("skill command", () => {
    it("parses 'skill:<name>' with args", () => {
      expect(parsePiCommand("skill:research do a thing")).toEqual({
        kind: "skill",
        name: "research",
        args: "do a thing",
      });
    });

    it("parses 'skill:<name>' without args", () => {
      expect(parsePiCommand("skill:research")).toEqual({
        kind: "skill",
        name: "research",
        args: undefined,
      });
    });

    it("rejects 'skill:' (empty name)", () => {
      expect(parsePiCommand("skill:")).toBeNull();
    });

    it("rejects 'skill' without colon", () => {
      expect(parsePiCommand("skill")).toBeNull();
    });
  });

  describe("prompt command", () => {
    it("parses 'prompt:<name>' with args", () => {
      expect(parsePiCommand("prompt:commit fix the bug")).toEqual({
        kind: "prompt",
        name: "commit",
        args: "fix the bug",
      });
    });

    it("parses 'prompt:<name>' without args", () => {
      expect(parsePiCommand("prompt:commit")).toEqual({
        kind: "prompt",
        name: "commit",
        args: undefined,
      });
    });

    it("rejects 'prompt:' (empty name)", () => {
      expect(parsePiCommand("prompt:")).toBeNull();
    });

    it("rejects 'prompt' without colon", () => {
      expect(parsePiCommand("prompt")).toBeNull();
    });
  });

  describe("bare prompt names (ticket 0052)", () => {
    // The webapp slash menu sends a bare prompt name (e.g. "commit fix the
    // bug") — no "prompt:" prefix. parsePiCommand recognizes it as a prompt
    // command ONLY when the name is in the provided prompt-names set, so an
    // unknown bare name still falls through to an ordinary user message.
    it("recognizes a bare prompt name when it is in the prompt-names set", () => {
      expect(parsePiCommand("commit", ["commit", "review"])).toEqual({
        kind: "prompt",
        name: "commit",
      });
    });

    it("recognizes a bare prompt name with args", () => {
      expect(parsePiCommand("commit fix the bug", ["commit"])).toEqual({
        kind: "prompt",
        name: "commit",
        args: "fix the bug",
      });
    });

    it("does NOT recognize a bare name that is not a registered prompt (falls through to null)", () => {
      expect(parsePiCommand("commit", [])).toBeNull();
      expect(parsePiCommand("commit", ["review"])).toBeNull();
    });

    it("does not need the prompt-names set when the prompt: prefix is used", () => {
      expect(parsePiCommand("prompt:commit fix the bug")).toEqual({
        kind: "prompt",
        name: "commit",
        args: "fix the bug",
      });
    });

    it("does not shadow real commands even if a prompt shares their name", () => {
      // "compact" is a real command; even if a prompt named "compact" exists,
      // the built-in command wins.
      expect(parsePiCommand("compact", ["compact"])).toEqual({ kind: "compact" });
    });
  });

  describe("unknown / unparseable commands", () => {
    it("returns null for totally unknown commands", () => {
      expect(parsePiCommand("foo bar")).toBeNull();
      expect(parsePiCommand("")).toBeNull();
      expect(parsePiCommand("model")).toBeNull(); // model without args
    });

    it("returns null for a bare unknown name with no prompt-names set", () => {
      expect(parsePiCommand("commit")).toBeNull();
      expect(parsePiCommand("commit fix the bug")).toBeNull();
    });
  });
});