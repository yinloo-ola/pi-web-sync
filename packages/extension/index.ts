import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { RelayClient } from "./relay-client";
import type { RelayMessage } from "./types";

const RELAY_URL = process.env.PI_WEB_SYNC_RELAY_URL ?? "wss://pi-web-sync-relay.ola-app.workers.dev";
const WEBAPP_URL = process.env.PI_WEB_SYNC_WEBAPP_URL ?? "https://pi-web-sync-webapp.pages.dev";

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

/** Build the web app URL for a given session ID. */
function getSessionUrl(sessionId: string, webappUrl: string): string {
  return `${webappUrl}/session/${sessionId}`;
}

/** Pi extension that syncs the current session with a web app via WebSocket relay. */
export default function (pi: ExtensionAPI) {
  console.log("[pi-web-sync] extension loaded");
  let client: RelayClient | null = null;
  let sessionId: string | null = null;
  let assistantBuffer = "";
  let relayUrl = RELAY_URL;
  let webappUrl = WEBAPP_URL;

  /** Attempt to connect to the relay. Returns true on success. */
  async function connectRelay(ctx: { ui: any; sessionManager: { getBranch: () => Array<Record<string, unknown>>; getSessionId: () => string } }): Promise<boolean> {
    const sid = ctx.sessionManager.getSessionId();
    sessionId = sid;

    try {
      client = new RelayClient(relayUrl, sessionId);
      await client.connect();
      console.log("[pi-web-sync] connected to relay");

      // Listen for messages from web app
      client.onMessage(async (msg: RelayMessage) => {
        if (msg.type === "user_message") {
          const payload = msg.payload as { text: string };
          pi.sendUserMessage(payload.text);
        }
      });

      // Handle sync requests from web app (full history)
      client.onSyncRequest(async () => {
        try {
          const entries = ctx.sessionManager.getBranch();
          const messages = entries
            .filter((e: Record<string, unknown>) => (e as { type: string }).type === "message")
            .map((e: Record<string, unknown>) => {
              const msg = (e as { message: Record<string, unknown> }).message;
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
          console.error("[pi-web-sync] sync request failed:", err);
        }
      });

      ctx.ui.notify(`Web sync: ${getSessionUrl(sid, webappUrl)}`, "info");
      return true;
    } catch (err) {
      console.error("[pi-web-sync] failed to connect:", err);
      ctx.ui.notify("Web sync: relay connection failed", "error");
      sessionId = null;
      client = null;
      return false;
    }
  }

  /** Disconnect from relay. */
  function disconnectRelay(): void {
    client?.disconnect();
    client = null;
    sessionId = null;
    assistantBuffer = "";
  }

  // Register /web-sync command (gets auto-complete in pi)
  pi.registerCommand("web-sync", {
    description: "Sync pi session with web app — connect, disconnect, or status",
    handler: async (args, ctx: ExtensionCommandContext) => {
      if (!args || args.startsWith("connect")) {
        // /web-sync or /web-sync connect [relay_url] [webapp_url]
        if (client) {
          ctx.ui.notify("Web sync: already connected", "info");
          return;
        }
        const parts = args ? args.split(" ") : [];
        if (parts[1]) relayUrl = parts[1];
        if (parts[2]) webappUrl = parts[2];
        await connectRelay(ctx);
      } else if (args.startsWith("disconnect")) {
        if (!client) {
          ctx.ui.notify("Web sync: not connected", "info");
        } else {
          disconnectRelay();
          ctx.ui.notify("Web sync: disconnected", "info");
        }
      } else if (args.startsWith("status")) {
        if (client && sessionId) {
          ctx.ui.notify(`Web sync: connected — ${getSessionUrl(sessionId, webappUrl)}`, "info");
        } else {
          ctx.ui.notify("Web sync: not connected", "info");
        }
      }
    },
  });

  // Forward non-command user messages to web app (if connected)
  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" };

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
  pi.on("session_shutdown", async () => {
    client?.disconnect();
    client = null;
    sessionId = null;
    assistantBuffer = "";
  });
}