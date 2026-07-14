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

  describe("unknown / unparseable commands", () => {
    it("returns null for totally unknown commands", () => {
      expect(parsePiCommand("foo bar")).toBeNull();
      expect(parsePiCommand("")).toBeNull();
      expect(parsePiCommand("model")).toBeNull(); // model without args
    });

    // CURRENT behaviour (ticket 0050): a bare prompt name in the form the
    // webapp menu sends ("/commit") is NOT recognized → null → the webapp
    // falls through to a user_message. Ticket 0052 changes this routing.
    it("returns null for a bare prompt name (webapp menu form) — current behaviour", () => {
      expect(parsePiCommand("commit")).toBeNull();
      expect(parsePiCommand("commit fix the bug")).toBeNull();
    });
  });
});