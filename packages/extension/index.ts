import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { RelayClient } from "./relay-client";
import type { RelayMessage } from "./types";

const RELAY_URL = process.env.PI_WEB_SYNC_RELAY_URL ?? "ws://localhost:8787";
const WEBAPP_URL = process.env.PI_WEB_SYNC_WEBAPP_URL ?? "http://localhost:5173";

/** Generate a random session ID (8 hex characters). */
function generateSessionId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
  async function connectRelay(ctx: { ui: any; sessionManager: { getBranch: () => Array<Record<string, unknown>> } }): Promise<boolean> {
    const sid = generateSessionId();
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

      pi.ui.notify(`Web sync: ${getSessionUrl(sid, webappUrl)}`, "info");
      return true;
    } catch (err) {
      console.error("[pi-web-sync] failed to connect:", err);
      pi.ui.notify("Web sync: relay connection failed", "error");
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

  // Handle web-sync commands (no leading slash — pi may intercept /-prefixed commands)
  pi.on("input", async (event, ctx) => {
    // Don't process messages from the web app itself
    if (event.source === "extension") return { action: "continue" };

    const text = event.text;
    console.log("[pi-web-sync] input event fired:", text);

    // Check for web-sync commands
    if (text.startsWith("web-sync ")) {
      const parts = text.split(" ");
      const command = parts[1];

      if (command === "connect") {
        if (client) {
          pi.ui.notify("Web sync: already connected", "info");
          return { action: "continue" };
        }
        // Optional args: [relay_url] [webapp_url]
        if (parts[2]) relayUrl = parts[2];
        if (parts[3]) webappUrl = parts[3];
        await connectRelay(ctx);
      } else if (command === "disconnect") {
        if (!client) {
          pi.ui.notify("Web sync: not connected", "info");
        } else {
          disconnectRelay();
          pi.ui.notify("Web sync: disconnected", "info");
        }
      } else if (command === "status") {
        if (client && sessionId) {
          pi.ui.notify(`Web sync: connected — ${getSessionUrl(sessionId, webappUrl)}`, "info");
        } else {
          pi.ui.notify("Web sync: not connected", "info");
        }
      }

      return { action: "continue" };
    }

    // Also handle bare "web-sync" (no subcommand) as "connect"
    if (text === "web-sync") {
      if (!client) await connectRelay(ctx);
      else pi.ui.notify("Web sync: already connected", "info");
      return { action: "continue" };
    }

    // Forward non-command user messages to web app (if connected)
    if (client) {
      client.send({
        type: "user_message",
        sessionId: sessionId!,
        payload: { role: "user", text, timestamp: Date.now() },
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