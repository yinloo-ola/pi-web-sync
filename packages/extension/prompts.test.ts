import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadPromptTemplates, expandPromptTemplate, parseCommandArgs, substituteArgs } from "./prompts";

describe("parseCommandArgs", () => {
  it("splits on whitespace", () => {
    expect(parseCommandArgs("foo bar baz")).toEqual(["foo", "bar", "baz"]);
  });

  it("respects double quotes", () => {
    expect(parseCommandArgs('foo "bar baz"')).toEqual(["foo", "bar baz"]);
  });

  it("respects single quotes", () => {
    expect(parseCommandArgs("foo 'bar baz'")).toEqual(["foo", "bar baz"]);
  });

  it("returns empty array for empty string", () => {
    expect(parseCommandArgs("")).toEqual([]);
  });
});

describe("substituteArgs", () => {
  it("replaces positional args", () => {
    expect(substituteArgs("Hello $1, meet $2", ["Alice", "Bob"])).toBe("Hello Alice, meet Bob");
  });

  it("replaces all-args placeholders", () => {
    expect(substituteArgs("Args: $@", ["a", "b", "c"])).toBe("Args: a b c");
    expect(substituteArgs("Args: $ARGUMENTS", ["a", "b", "c"])).toBe("Args: a b c");
  });

  it("uses defaults when arg is missing", () => {
    expect(substituteArgs("Count: ${1:-7}", [])).toBe("Count: 7");
    expect(substituteArgs("Count: ${1:-7}", ["3"])).toBe("Count: 3");
  });

  it("defaults an empty arg to the default value", () => {
    expect(substituteArgs("Thing: ${1:-none}", [""])).toBe("Thing: none");
  });

  it("slices args from N onward", () => {
    expect(substituteArgs("Rest: ${@:2}", ["a", "b", "c"])).toBe("Rest: b c");
  });

  it("slices a fixed length", () => {
    expect(substituteArgs("Two: ${@:2:2}", ["a", "b", "c", "d"])).toBe("Two: b c");
  });

  it("treats slice start 0 as 1", () => {
    expect(substituteArgs("All: ${@:0}", ["a", "b"])).toBe("All: a b");
  });
});

describe("expandPromptTemplate", () => {
  const templates = [
    {
      name: "review",
      description: "Review changes",
      content: "Review these changes carefully:\n- Bugs\n- Security",
      filePath: "/tmp/review.md",
    },
    {
      name: "greet",
      description: "Greet",
      content: "Hello $1, welcome to $2!",
      filePath: "/tmp/greet.md",
    },
  ];

  it("expands a template with no args", () => {
    expect(expandPromptTemplate("/review", templates)).toContain("Review these changes");
  });

  it("expands a template with args", () => {
    expect(expandPromptTemplate("/greet Alice Wonderland", templates)).toBe("Hello Alice, welcome to Wonderland!");
  });

  it("returns original text when no template matches", () => {
    expect(expandPromptTemplate("/unknown thing", templates)).toBe("/unknown thing");
  });

  it("returns original text when it does not start with /", () => {
    expect(expandPromptTemplate("not a command", templates)).toBe("not a command");
  });

  it("preserves extra whitespace in content", () => {
    expect(expandPromptTemplate("/review", templates)).toContain("Review these changes carefully:");
  });
});

describe("loadPromptTemplates", () => {
  let agentDir: string;
  let cwd: string;

  beforeEach(() => {
    agentDir = mkdtempSync(join(tmpdir(), "pi-web-sync-agent-"));
    cwd = mkdtempSync(join(tmpdir(), "pi-web-sync-cwd-"));
  });

  afterEach(() => {
    cleanupDir(agentDir);
    cleanupDir(cwd);
  });

  function cleanupDir(dir: string) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }

  it("loads a global prompt with description from frontmatter", () => {
    const promptsDir = join(agentDir, "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(
      join(promptsDir, "review.md"),
      "---\ndescription: Review staged changes\nargument-hint: <files>\n---\nReview the changes carefully.",
    );

    const templates = loadPromptTemplates(cwd, agentDir, false);

    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe("review");
    expect(templates[0].description).toBe("Review staged changes");
    expect(templates[0].argumentHint).toBe("<files>");
    expect(templates[0].content).toContain("Review the changes carefully.");
  });

  it("falls back to first body line for description", () => {
    const promptsDir = join(agentDir, "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "summarize.md"), "Summarize the current state in bullet points.\n");

    const templates = loadPromptTemplates(cwd, agentDir, false);

    expect(templates[0].description).toContain("Summarize the current state");
  });

  it("loads project prompts only when trusted", () => {
    const globalDir = join(agentDir, "prompts");
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(join(globalDir, "global.md"), "global prompt");

    const projectDir = join(cwd, ".pi", "prompts");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "project.md"), "project prompt");

    expect(loadPromptTemplates(cwd, agentDir, false)).toHaveLength(1);
    expect(loadPromptTemplates(cwd, agentDir, true)).toHaveLength(2);
  });

  it("ignores non-md files", () => {
    const promptsDir = join(agentDir, "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "notes.txt"), "not a prompt");
    writeFileSync(join(promptsDir, "valid.md"), "valid prompt");

    const templates = loadPromptTemplates(cwd, agentDir, false);
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe("valid");
  });

  it("returns empty array when directories do not exist", () => {
    expect(loadPromptTemplates(cwd, agentDir, false)).toHaveLength(0);
  });

  // Two templates with the same name would collide: expandPromptTemplate uses
  // templates.find(t => t.name === name) (only the first ever wins), and the
  // webapp slash menu keys list items by name. Loading must dedupe by name
  // so a name uniquely identifies a template.
  it("dedupes templates that share a name (first-wins: global > project)", () => {
    const globalDir = join(agentDir, "prompts");
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(join(globalDir, "review.md"), "global review body");

    const projectDir = join(cwd, ".pi", "prompts");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "review.md"), "project review body");

    const templates = loadPromptTemplates(cwd, agentDir, true);

    expect(templates).toHaveLength(1);
    expect(templates[0].content).toBe("global review body");
  });
});