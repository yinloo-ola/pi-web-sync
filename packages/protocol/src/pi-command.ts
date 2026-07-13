/**
 * Typed pi-command discriminated union and parser.
 *
 * The on-wire `pi_command` payload is this typed union (not a free-form
 * string), so both sides agree on the command vocabulary. The web app builds
 * typed values; the extension matches on `kind`.
 */

/** A typed pi command sent from the web app to the extension. */
export type PiCommand =
  | { kind: "model"; provider: string; id: string }
  | { kind: "skill"; name: string; args?: string }
  | { kind: "compact" };

/**
 * Parse a free-form command string (as typed by the user or built by the
 * slash menu) into a typed `PiCommand`. Returns `null` when the string is
 * unparseable — the caller should send it as an ordinary user message.
 *
 * The parsing rules match the extension's current string handler for
 * well-formed commands (ticket #0037 characterization). Malformed model
 * strings (missing slash) and empty skill names now return `null` and are
 * sent as ordinary user messages instead of producing degenerate calls —
 * an improvement over the original handler.
 */
export function parsePiCommand(input: string): PiCommand | null {
  const parts = input.split(" ");
  const cmd = parts[0];
  const args = parts.slice(1).join(" ");

  if (cmd === "model" && args) {
    // "model <provider>/<id>"
    const slash = args.indexOf("/");
    if (slash > 0) {
      return {
        kind: "model",
        provider: args.substring(0, slash),
        id: args.substring(slash + 1),
      };
    }
    // malformed — no slash or slash at position 0
    return null;
  }

  if (cmd === "compact") {
    // Compact: no args check (current handler doesn't guard on args)
    return { kind: "compact" };
  }

  if (cmd && cmd.startsWith("skill:")) {
    // "skill:<name>[ args]"
    const name = cmd.substring("skill:".length);
    if (!name) return null; // empty name
    return {
      kind: "skill",
      name,
      ...(args ? { args } : {}),
    };
  }

  return null;
}