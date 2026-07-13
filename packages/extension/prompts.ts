import { createRequire } from "module";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";

const _require = typeof require === "undefined" ? createRequire(import.meta.url) : require;

/** A prompt template loaded from a markdown file. */
export interface PromptTemplate {
  name: string;
  description: string;
  argumentHint?: string;
  content: string;
  filePath: string;
}

/** Load .md prompt templates from global, (optionally) project, and installed packages. */
export function loadPromptTemplates(
  cwd: string,
  agentDir: string,
  projectTrusted: boolean,
): PromptTemplate[] {
  const templates: PromptTemplate[] = [];

  const globalDir = resolve(join(agentDir, "prompts"));
  templates.push(...loadTemplatesFromDir(globalDir));

  if (projectTrusted) {
    const projectDir = resolve(join(cwd, ".pi", "prompts"));
    templates.push(...loadTemplatesFromDir(projectDir));
  }

  templates.push(...loadPromptTemplatesFromPackages(agentDir));

  return templates;
}

/**
 * Discover prompt templates from installed packages listed in settings.json.
 * Scans npm-package entries for a `prompts/` directory and `pi.prompts` field.
 */
function loadPromptTemplatesFromPackages(agentDir: string): PromptTemplate[] {
  const templates: PromptTemplate[] = [];

  const settingsPath = join(agentDir, "settings.json");
  if (!existsSync(settingsPath)) return [];

  let settings: { packages?: string[] };
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch {
    return [];
  }

  const packages = settings.packages ?? [];
  for (const entry of packages) {
    if (typeof entry !== "string" || !entry.startsWith("npm:")) continue;

    const pkgName = entry.slice("npm:".length);

    try {
      // require.resolve may throw for packages not installed
      const pkgJsonPath = _require.resolve(pkgName + "/package.json");
      const pkgRoot = dirname(pkgJsonPath);

      // Always check for a prompts/ subdirectory
      templates.push(...loadTemplatesFromDir(join(pkgRoot, "prompts")));

      // Check for pi.prompts field in package.json
      let pkgJson: { pi?: { prompts?: string | string[] } };
      try {
        pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
      } catch {
        continue;
      }

      const piConfig = pkgJson.pi;
      if (piConfig?.prompts) {
        const paths = Array.isArray(piConfig.prompts) ? piConfig.prompts : [piConfig.prompts];
        for (const promptPath of paths) {
          const resolved = resolve(pkgRoot, promptPath);
          if (existsSync(resolved)) {
            const stats = statSync(resolved);
            if (stats.isDirectory()) {
              templates.push(...loadTemplatesFromDir(resolved));
            } else if (stats.isFile() && promptPath.endsWith(".md")) {
              const parsed = loadTemplateFromFile(resolved);
              if (parsed) templates.push(parsed);
            }
          }
        }
      }
    } catch {
      // Package not installed — skip silently
    }
  }

  return templates;
}

function loadTemplatesFromDir(dir: string): PromptTemplate[] {
  if (!existsSync(dir)) return [];

  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }

  const out: PromptTemplate[] = [];
  for (const name of names) {
    const fullPath = join(dir, name);
    let isFile = false;
    try {
      const stats = statSync(fullPath);
      isFile = stats.isFile();
    } catch {
      continue;
    }
    if (!isFile || !name.endsWith(".md")) continue;

    const parsed = loadTemplateFromFile(fullPath);
    if (parsed) out.push(parsed);
  }

  return out;
}

function loadTemplateFromFile(filePath: string): PromptTemplate | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter<Record<string, string>>(raw);

    const name = basename(filePath).replace(/\.md$/, "");
    const argumentHint = frontmatter["argument-hint"];

    let description = frontmatter.description || "";
    if (!description) {
      const firstLine = body.split("\n").find((line) => line.trim());
      if (firstLine) {
        description = firstLine.slice(0, 60);
        if (firstLine.length > 60) description += "...";
      }
    }

    return {
      name,
      description,
      ...(argumentHint ? { argumentHint } : {}),
      content: body,
      filePath,
    };
  } catch {
    return null;
  }
}

/** Expand a prompt template if text matches /name [args]. Returns original text if no match. */
export function expandPromptTemplate(text: string, templates: PromptTemplate[]): string {
  if (!text.startsWith("/")) return text;

  const match = text.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
  if (!match) return text;

  const templateName = match[1];
  const argsString = match[2] ?? "";

  const template = templates.find((t) => t.name === templateName);
  if (!template) return text;

  const args = parseCommandArgs(argsString);
  return substituteArgs(template.content, args);
}

/** Parse bash-style arguments, respecting single and double quotes. */
export function parseCommandArgs(argsString: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuote: string | null = null;

  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i];

    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current) args.push(current);
  return args;
}

/** Substitute positional args, all-args, defaults, and slices in template content. */
export function substituteArgs(content: string, args: string[]): string {
  const allArgs = args.join(" ");

  return content.replace(
    /\$\{(\d+):-([^}]*)\}|\$\{@:(\d+)(?::(\d+))?\}|\$(ARGUMENTS|@|\d+)/g,
    (_match, defaultNum, defaultValue, sliceStart, sliceLength, placeholder) => {
      if (defaultNum) {
        const index = parseInt(defaultNum, 10) - 1;
        const value = args[index];
        return value ? value : defaultValue;
      }

      if (sliceStart) {
        let start = parseInt(sliceStart, 10) - 1;
        if (start < 0) start = 0;

        if (sliceLength) {
          const length = parseInt(sliceLength, 10);
          return args.slice(start, start + length).join(" ");
        }
        return args.slice(start).join(" ");
      }

      if (placeholder === "ARGUMENTS" || placeholder === "@") {
        return allArgs;
      }

      const index = parseInt(placeholder, 10) - 1;
      return args[index] ?? "";
    },
  );
}