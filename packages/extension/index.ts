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
function getSessionUrl(sessionId: string): string {
  return `${WEBAPP_URL}/session/${sessionId}`;
}

/** Pi extension that syncs the current session with a web app via WebSocket relay. */
export default function (pi: ExtensionAPI) {
  let client: RelayClient | null = null;
  let sessionId: string | null = null;
  let assistantBuffer = "";
  /** Buffer messages sent before WebSocket connects */
  let pendingMessages: Array<{ text: string; timestamp: number }> = [];

  pi.on("session_start", async (event, ctx) => {
    sessionId = generateSessionId();

    // Connect to relay
    try {
      client = new RelayClient(RELAY_URL, sessionId);
      await client.connect();
      console.log("[pi-web-sync] connected to relay");

      // Flush pending messages
      for (const msg of pendingMessages) {
        client.send({
          type: "user_message",
          sessionId,
          payload: { role: "user", text: msg.text, timestamp: msg.timestamp },
        });
      }
      pendingMessages = [];
    } catch (err) {
      console.error("[pi-web-sync] failed to connect:", err);
      ctx.ui.notify("Web sync: relay connection failed", "error");
      return;
    }

    // Listen for messages from web app
    client.onMessage(async (msg: RelayMessage) => {
      if (msg.type === "user_message") {
        const payload = msg.payload as { text: string };
        pi.sendUserMessage(payload.text);
      }
    });

    ctx.ui.notify(`Web sync: ${getSessionUrl(sessionId)}`, "info");

    // Handle sync requests from web app (full history)
    // HAZARD: sessionManager access during events — verify this is safe in pi's event model
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
  });

  // Forward user messages typed in pi to the web app.
  // Uses the `input` event which has the raw text (simpler than parsing content blocks).
  pi.on("input", async (event, ctx) => {
    // Don't echo messages that came from the web app itself
    if (event.source === "extension") return { action: "continue" };

    if (client) {
      client.send({
        type: "user_message",
        sessionId: sessionId!,
        payload: { role: "user", text: event.text, timestamp: Date.now() },
      });
    } else {
      // WebSocket not yet connected — buffer for later
      pendingMessages.push({ text: event.text, timestamp: Date.now() });
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
    pendingMessages = [];
  });
}