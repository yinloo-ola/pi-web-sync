/**
 * Handle pi commands received from the web app.
 *
 * The extension now receives a typed `PiCommand` (discriminated union)
 * instead of a free-form string. The string parser has been deleted;
 * parsing happens on the web app side via `parsePiCommand`.
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { RelayClient } from "./relay-client";
import type { PiCommand } from "pi-web-sync-protocol";

export async function handlePiCommand(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  command: PiCommand,
  _client: RelayClient,
  _sessionId: string,
): Promise<void> {
  console.debug(`[pi-web-sync] handlePiCommand: kind=${command.kind}`);

  switch (command.kind) {
    case "model": {
      const model = ctx.modelRegistry.find(command.provider, command.id);
      if (model) {
        const success = await pi.setModel(model);
        if (success) {
          ctx.ui.notify(`Switched to ${model.name ?? command.id}`, "info");
        } else {
          ctx.ui.notify(`No API key for ${command.provider}/${command.id}`, "error");
        }
      } else {
        ctx.ui.notify(`Model not found: ${command.provider}/${command.id}`, "error");
      }
      break;
    }

    case "compact": {
      ctx.compact();
      ctx.ui.notify("Compacting...", "info");
      break;
    }

    case "skill": {
      // Reconstruct the command string to send via sendMessage
      const cmdStr = command.args
        ? `/skill:${command.name} ${command.args}`
        : `/skill:${command.name}`;
      pi.sendMessage({
        customType: "web-skill-command",
        content: cmdStr,
        display: false,
      }, {
        triggerTurn: true,
      });
      break;
    }
  }
}