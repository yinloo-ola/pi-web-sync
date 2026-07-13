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

  describe("unknown / unparseable commands", () => {
    it("returns null for totally unknown commands", () => {
      expect(parsePiCommand("foo bar")).toBeNull();
      expect(parsePiCommand("")).toBeNull();
      expect(parsePiCommand("model")).toBeNull(); // model without args
    });
  });
});