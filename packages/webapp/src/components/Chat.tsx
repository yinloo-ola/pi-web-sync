import { stub } from "../../../_ptk/stub";
import type { ChatMessage, RelayMessage } from "../types";
import { MessageBubble } from "./MessageBubble";

interface ChatProps {
  sessionId: string;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  connectionState: string;
}

/** Main chat UI: message list, input box, connection status. */
export function Chat({ sessionId, messages, onSendMessage, connectionState }: ChatProps) {
  return stub("webapp.Chat");
}