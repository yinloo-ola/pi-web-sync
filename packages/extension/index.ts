import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { stub } from "../_ptk/stub";
import { RelayClient } from "./relay-client";
import type { RelayMessage } from "./types";

const RELAY_URL = process.env.PI_WEB_SYNC_RELAY_URL ?? "wss://relay.example.com";

/** Pi extension that syncs the current session with a web app via WebSocket relay. */
export default function (pi: ExtensionAPI) {
  let client: RelayClient | null = null;
  let sessionId: string | null = null;
  let assistantBuffer = "";

  pi.on("session_start", async (event, ctx) => {
    // Generate or restore session ID for this pi session
    sessionId = stub("extension.session_start.generateSessionId");

    // Connect to relay
    client = new RelayClient(RELAY_URL, sessionId);
    await client.connect();

    // Listen for messages from web app
    client.onMessage(async (msg: RelayMessage) => {
      if (msg.type === "user_message") {
        const payload = msg.payload as { text: string };
        // Inject web app user message into pi
        pi.sendUserMessage(payload.text);
      }
    });

    ctx.ui.notify(`Web sync: ${getSessionUrl(sessionId)}`, "info");
  });

  // Forward user messages typed in pi to the web app
  pi.on("message_start", async (event, ctx) => {
    if (event.message.role === "user" && client) {
      const text = extractText(event.message.content);
      client.send({
        type: "user_message",
        sessionId: sessionId!,
        payload: { role: "user", text, timestamp: Date.now() },
      });
    }
  });

  // Capture assistant streaming deltas
  pi.on("message_update", async (event) => {
    if (event.message.role === "assistant" && client && event.assistantMessageEvent) {
      const evt = event.assistantMessageEvent;
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

  // Handle web app sync requests (full history)
  // HAZARD: sessionManager access during events — verify this is safe in pi's event model
  pi.on("session_start", async (_event, ctx) => {
    client?.onSyncRequest(async () => {
      const entries = ctx.sessionManager.getBranch();
      const messages = entries
        .filter((e) => e.type === "message")
        .map((e) => {
          const msg = e.message;
          if (msg.role === "user") {
            return { role: "user" as const, text: extractText(msg.content), timestamp: msg.timestamp };
          }
          if (msg.role === "assistant") {
            return { role: "assistant" as const, text: extractText(msg.content), timestamp: msg.timestamp };
          }
          return null;
        })
        .filter(Boolean);

      client!.send({
        type: "sync_response",
        sessionId: sessionId!,
        payload: { messages },
      });
    });
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async () => {
    client?.disconnect();
    client = null;
    sessionId = null;
    assistantBuffer = "";
  });
}

/** Extract plain text from message content blocks. */
function extractText(content: unknown): string {
  return stub("extension.extractText");
}

/** Build the web app URL for a given session ID. */
function getSessionUrl(sessionId: string): string {
  return stub("extension.getSessionUrl");
}