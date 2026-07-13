/**
 * Handle pi commands received from the web app.
 *
 * Extracted from the extension factory so it can be characterized and tested
 * independently. Each branch maps a command string to a specific pi-API action;
 * these are the behaviors that ticket #0040 (typed commands) must preserve.
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { RelayClient } from "./relay-client";

export async function handlePiCommand(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  command: string,
  _client: RelayClient,
  _sessionId: string,
): Promise<void> {
  // Parse "model provider/id" or just "model"
  const parts = command.split(" ");
  const cmd = parts[0];
  const args = parts.slice(1).join(" ");
  console.debug(`[pi-web-sync] handlePiCommand: cmd=${cmd}, args=${args}`);

  if (cmd === "model" && args) {
    // Handle model switch: "model provider/id"
    const slash = args.indexOf("/");
    if (slash > 0) {
      const provider = args.substring(0, slash);
      const modelId = args.substring(slash + 1);
      const model = ctx.modelRegistry.find(provider, modelId);
      if (model) {
        const success = await pi.setModel(model);
        if (success) {
          ctx.ui.notify(`Switched to ${model.name ?? modelId}`, "info");
        } else {
          ctx.ui.notify(`No API key for ${provider}/${modelId}`, "error");
        }
      } else {
        ctx.ui.notify(`Model not found: ${provider}/${modelId}`, "error");
      }
    } else {
      ctx.ui.notify("Usage: /model provider/model-id", "error");
    }
  } else if (cmd === "compact") {
    // Trigger compaction programmatically
    ctx.compact();
    ctx.ui.notify("Compacting...", "info");
  } else {
    // For skill commands, use sendMessage to trigger expansion
    if (cmd.startsWith("skill:")) {
      // Use sendMessage with custom type to trigger skill expansion
      pi.sendMessage({
        customType: "web-skill-command",
        content: `/${command}`,
        display: false,
      }, {
        triggerTurn: true,
      });
    } else {
      // For other commands, send as user message with / prefix
      pi.sendUserMessage(`/${command}`);
    }
  }
}