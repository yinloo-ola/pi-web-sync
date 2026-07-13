import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import QRCode from "qrcode";
import { RelayClient, MAX_RETRIES, type ConnectionState } from "./relay-client";
import type { RelayMessage } from "./types";

interface WebSyncConfig {
  relayUrl: string;
  webappUrl: string;
}

/** Load config from ~/.pi-web-sync.json or ./.pi-web-sync.json, falling back to env vars. */
function loadConfig(): WebSyncConfig {
  // Priority: project config > global config > env vars
  const candidates = [
    { path: join(process.cwd(), ".pi-web-sync.json"), label: "project" },
    { path: join(homedir(), ".pi-web-sync.json"), label: "global" },
  ];

  for (const { path } of candidates) {
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, "utf-8");
        const config = JSON.parse(raw) as WebSyncConfig;
        if (config.relayUrl && config.webappUrl) {
          return config;
        }
      } catch (err) {
        console.warn(`[pi-web-sync] failed to load config from ${path}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // Fall back to env vars
  const relayUrl = process.env.PI_WEB_SYNC_RELAY_URL;
  const webappUrl = process.env.PI_WEB_SYNC_WEBAPP_URL;

  if (relayUrl && webappUrl) {
    return { relayUrl, webappUrl };
  }

  return { relayUrl: "", webappUrl: "" };
}

const config = loadConfig();
const RELAY_URL = config.relayUrl;
const WEBAPP_URL = config.webappUrl;

/** Extract plain text from pi message content blocks. */
function extractText(content: unknown): string {
  if (Array.isArray(content)) {
    return content
      .filter((block: Record<string, unknown>) => block.type === "text")
      .map((block: Record<string, unknown>) => String(block.text ?? ""))
      .join("");
  }
  if (typeof content === "string") return content;
  return String(content ?? "");
}

/** Build the web app URL for a given session ID, including the relay URL as a query param. */
function getSessionUrl(sessionId: string, webappUrl: string, relayUrl: string): string {
  const url = new URL(`/session/${sessionId}`, webappUrl);
  url.searchParams.set("relay", relayUrl);
  return url.toString();
}

/** Pi extension that syncs the current session with a web app via WebSocket relay. */
export default function (pi: ExtensionAPI) {
  let client: RelayClient | null = null;
  let sessionId: string | null = null;
  let connectionState: ConnectionState | null = null;
  let assistantBuffer = "";
  let relayUrl = RELAY_URL;
  let webappUrl = WEBAPP_URL;

  /** Handle pi commands received from the web app. */
  async function handlePiCommand(
    pi: ExtensionAPI,
    ctx: ExtensionCommandContext,
    command: string,
    client: RelayClient,
    sessionId: string,
  ): Promise<void> {
    // Parse "model provider/id" or just "model"
    const parts = command.split(" ");
    const cmd = parts[0];
    const args = parts.slice(1).join(" ");

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
    } else {
      // For other commands, send as user message with / prefix
      pi.sendUserMessage(`/${command}`);
    }
  }

  /** Attempt to connect to the relay. Returns true on success. */
  async function connectRelay(ctx: ExtensionCommandContext): Promise<boolean> {
    const sid = ctx.sessionManager.getSessionId();
    sessionId = sid;

    try {
      const sessionUrl = getSessionUrl(sid, webappUrl, relayUrl);
      client = new RelayClient(relayUrl, sessionId);

      // Connection state drives the footer (connected URL, reconnect progress,
      // failure). Registered before connect() so the first "connected" is caught.
      client.onStatus((state, attempt) => {
        connectionState = state;
        if (state === "connected") {
          ctx.ui.setStatus("pi-web-sync", sessionUrl);
        } else if (state === "reconnecting") {
          ctx.ui.setStatus("pi-web-sync", `Web sync: reconnecting (${attempt}/${MAX_RETRIES})…`);
        } else if (state === "failed") {
          ctx.ui.setStatus("pi-web-sync", "Web sync: connection failed — /web-sync connect to retry");
        }
      });

      // Listen for messages from web app
      client.onMessage(async (msg: RelayMessage) => {
        if (msg.type === "user_message") {
          const payload = msg.payload as { text: string };
          pi.sendUserMessage(payload.text);
        } else if (msg.type === "pi_command") {
          const payload = msg.payload as { command: string };
          await handlePiCommand(pi, ctx, payload.command, client!, sessionId!);
        }
      });

      // Handle sync requests from web app (full history)
      client.onSyncRequest(async () => {
        try {
          const entries = ctx.sessionManager.getBranch();
          const messages = entries
            .filter((e) => e.type === "message")
            .map((e) => {
              const msg = e.message;
              if (msg.role === "user") {
                return { role: "user" as const, text: extractText(msg.content), timestamp: msg.timestamp ?? Date.now() };
              }
              if (msg.role === "assistant") {
                return { role: "assistant" as const, text: extractText(msg.content), timestamp: msg.timestamp ?? Date.now() };
              }
              return null;
            })
            .filter(Boolean);

          client!.send({
            type: "sync_response",
            sessionId: sessionId!,
            payload: { messages },
          });
        } catch (err) {
          console.warn("[pi-web-sync] sync_response failed:", err instanceof Error ? err.message : err);
        }
      });

      await client.connect();

      // Send available models to the web app
      try {
        const allModels = ctx.modelRegistry.getAll();
        const models = allModels.map((m) => ({
          id: m.id,
          provider: m.provider,
          name: m.name ?? m.id,
        }));
        client!.send({
          type: "models_list",
          sessionId: sessionId!,
          payload: { models },
        });
      } catch (err) {
        console.debug("[pi-web-sync] failed to send models_list:", err instanceof Error ? err.message : err);
      }

      // Send available skills to the web app
      try {
        const allCommands = pi.getCommands();
        const skills = allCommands
          .filter((cmd) => cmd.source === "skill")
          .map((cmd) => ({
            name: cmd.name,
            description: cmd.description,
            source: cmd.source,
          }));
        client!.send({
          type: "skills_list",
          sessionId: sessionId!,
          payload: { skills },
        });
      } catch (err) {
        console.debug("[pi-web-sync] failed to send skills_list:", err instanceof Error ? err.message : err);
      }

      // Show QR code for the session URL (auto-dismisses after 10s)
      showQrCode(ctx.ui, sessionUrl);
      return true;
    } catch {
      ctx.ui.notify("Web sync: relay connection failed", "error");
      ctx.ui.setStatus("pi-web-sync", "");
      connectionState = null;
      sessionId = null;
      client = null;
      return false;
    }
  }

  let qrTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Show QR code widget and auto-dismiss after 10 seconds. */
  async function showQrCode(ui: any, url: string): Promise<void> {
    // Clear any previous timeout
    if (qrTimeout !== null) {
      clearTimeout(qrTimeout);
      qrTimeout = null;
    }

    try {
      const qrString = await QRCode.toString(url, { type: "terminal", small: true });
      ui.setWidget("pi-web-sync", [
        "📱 Scan to open web sync (auto-dismisses in 10s):",
        qrString,
        url,
      ]);
      qrTimeout = setTimeout(() => {
        ui.setWidget("pi-web-sync", []);
        qrTimeout = null;
      }, 10_000);
    } catch (err) {
      console.debug("[pi-web-sync] QR code render failed:", err instanceof Error ? err.message : err);
      ui.notify(`Web sync: ${url}`, "info");
    }
  }

  /** Disconnect from relay. */
  function disconnectRelay(ctx?: { ui?: { setWidget?: (key: string, lines: string[]) => void; setStatus?: (key: string, text: string) => void } }): void {
    if (qrTimeout !== null) {
      clearTimeout(qrTimeout);
      qrTimeout = null;
    }
    client?.disconnect();
    client = null;
    sessionId = null;
    connectionState = null;
    assistantBuffer = "";
    ctx?.ui?.setWidget?.("pi-web-sync", []);
    ctx?.ui?.setStatus?.("pi-web-sync", "");
  }

  // Register /web-sync command (gets auto-complete in pi)
  pi.registerCommand("web-sync", {
    description: "Sync pi session with web app — connect, disconnect, status, or qr",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const subcommands = ["connect", "disconnect", "status", "qr"];
      const items = subcommands.map((s) => ({ value: s, label: s }));
      const filtered = items.filter((i) => i.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx: ExtensionCommandContext) => {
      if (!args || args.startsWith("connect")) {
        // /web-sync or /web-sync connect [relay_url] [webapp_url]
        if (client) {
          if (connectionState === "failed") {
            client.reconnect();
            ctx.ui.setStatus("pi-web-sync", "Web sync: reconnecting…");
          } else {
            ctx.ui.notify("Web sync: already connected", "info");
          }
          return;
        }
        const parts = args ? args.split(" ") : [];
        if (parts[1]) relayUrl = parts[1];
        if (parts[2]) webappUrl = parts[2];
        if (!relayUrl || !webappUrl) {
          ctx.ui.notify("Web sync: set relay and webapp URLs via /web-sync connect <relay> <webapp>, env vars, or ~/.pi-web-sync.json", "error");
          return;
        }
        await connectRelay(ctx);
      } else if (args.startsWith("disconnect")) {
        if (!client) {
          ctx.ui.notify("Web sync: not connected", "info");
        } else {
          disconnectRelay(ctx);
          ctx.ui.notify("Web sync: disconnected", "info");
        }
      } else if (args.startsWith("qr")) {
        if (!client || !sessionId) {
          ctx.ui.notify("Web sync: not connected", "info");
          return;
        }
        if (!webappUrl) {
          ctx.ui.notify("Web sync: no webapp URL configured", "error");
          return;
        }
        await showQrCode(ctx.ui, getSessionUrl(sessionId, webappUrl, relayUrl));
      } else if (args.startsWith("status")) {
        if (client && sessionId) {
          ctx.ui.notify(`Web sync: connected — ${getSessionUrl(sessionId, webappUrl, relayUrl)}`, "info");
        } else {
          ctx.ui.notify("Web sync: not connected", "info");
        }
      }
    },
  });

  // Dismiss QR widget when user starts typing (any non-empty input)
  function dismissQrWidget(ui: any): void {
    if (qrTimeout !== null) {
      clearTimeout(qrTimeout);
      qrTimeout = null;
    }
    ui.setWidget("pi-web-sync", []);
  }

  // Forward non-command user messages to web app (if connected)
  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" };

    // Dismiss QR widget on user typing
    if (event.text.trim()) {
      dismissQrWidget(ctx.ui);
    }

    if (client) {
      client.send({
        type: "user_message",
        sessionId: sessionId!,
        payload: { role: "user", text: event.text, timestamp: Date.now() },
      });
    }

    return { action: "continue" };
  });

  // Capture assistant streaming deltas
  pi.on("message_update", async (event) => {
    if (event.message.role === "assistant" && client && event.assistantMessageEvent) {
      const evt = event.assistantMessageEvent as { type: string; delta: string };
      if (evt.type === "text_delta") {
        assistantBuffer += evt.delta;
        client.send({
          type: "assistant_delta",
          sessionId: sessionId!,
          payload: { role: "assistant", delta: evt.delta, timestamp: Date.now() },
        });
      }
    }
  });

  // Send complete assistant message to web app
  pi.on("message_end", async (event) => {
    if (event.message.role === "assistant" && client && assistantBuffer) {
      client.send({
        type: "assistant_done",
        sessionId: sessionId!,
        payload: { role: "assistant", text: assistantBuffer, timestamp: Date.now() },
      });
      assistantBuffer = "";
    }
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async (event, ctx) => {
    // Notify web app that the session has ended before disconnecting.
    // Skip for reload — pi will reconnect to the same session shortly.
    if (client && sessionId && event.reason !== "reload") {
      const reason = event.reason === "quit" ? "shutdown" : "new_session";
      client.send({
        type: "session_ended",
        sessionId,
        payload: { reason },
      });
    }
    if (qrTimeout !== null) {
      clearTimeout(qrTimeout);
      qrTimeout = null;
    }
    client?.disconnect();
    client = null;
    sessionId = null;
    connectionState = null;
    assistantBuffer = "";
    ctx?.ui?.setWidget?.("pi-web-sync", []);
    ctx?.ui?.setStatus?.("pi-web-sync", "");
  });
}