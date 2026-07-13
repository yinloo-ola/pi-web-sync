import { useEffect, useRef, useState } from "react";
import type { ModelInfo } from "../hooks/useRelay";

export interface SlashCommand {
  name: string;
  description: string;
}

/** Available pi commands that can be sent from the webapp. */
export const PI_COMMANDS: SlashCommand[] = [
  { name: "model", description: "Switch the active model" },
  { name: "skill", description: "Run a skill by name" },
  { name: "compact", description: "Compact the conversation context" },
];

interface SlashMenuProps {
  /** The current input text (including the leading `/`). */
  input: string;
  /** Available models from pi's registry. */
  availableModels: ModelInfo[];
  /** Called when a command is selected. The full command string is passed (e.g., "model" or "model anthropic/claude-sonnet-4-5"). */
  onSelect: (command: string) => void;
  /** Called when the menu should be dismissed. */
  onDismiss: () => void;
}

/** Dropdown menu shown when the user types `/` in the input. */
export function SlashMenu({ input, availableModels, onSelect, onDismiss }: SlashMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);
  const [showModelSubmenu, setShowModelSubmenu] = useState(false);

  // Parse the input: "/model" or "/model <query>"
  const parts = input.slice(1).split(" ");
  const commandQuery = parts[0]?.toLowerCase() ?? "";
  const modelQuery = parts.slice(1).join(" ").toLowerCase();

  // Filter commands by prefix
  const filtered = PI_COMMANDS.filter((cmd) => cmd.name.toLowerCase().startsWith(commandQuery));

  // Reset active index and submenu when input changes
  useEffect(() => {
    activeIndexRef.current = 0;
    // Show model submenu if user typed "/model " (with space)
    if (commandQuery === "model" && parts.length > 1) {
      setShowModelSubmenu(true);
    } else {
      setShowModelSubmenu(false);
    }
  }, [input]);

  // Click outside to dismiss
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onDismiss]);

  // Filter models by query
  const filteredModels = availableModels.filter(
    (m) =>
      m.name.toLowerCase().includes(modelQuery) ||
      m.id.toLowerCase().includes(modelQuery) ||
      m.provider.toLowerCase().includes(modelQuery),
  );

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (showModelSubmenu) {
        // Go back to command list
        setShowModelSubmenu(false);
      } else {
        onDismiss();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const items = showModelSubmenu ? filteredModels : filtered;
      activeIndexRef.current = Math.min(activeIndexRef.current + 1, items.length - 1);
      const menuItems = menuRef.current?.querySelectorAll("[data-slash-item]");
      menuItems?.[activeIndexRef.current]?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndexRef.current = Math.max(activeIndexRef.current - 1, 0);
      const menuItems = menuRef.current?.querySelectorAll("[data-slash-item]");
      menuItems?.[activeIndexRef.current]?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (showModelSubmenu) {
        if (filteredModels.length > 0) {
          const model = filteredModels[activeIndexRef.current];
          onSelect(`model ${model.provider}/${model.id}`);
        }
      } else {
        if (filtered.length > 0) {
          const cmd = filtered[activeIndexRef.current].name;
          if (cmd === "model") {
            // Show model submenu
            setShowModelSubmenu(true);
            activeIndexRef.current = 0;
          } else {
            onSelect(cmd);
          }
        }
      }
      return;
    }
  }

  // Model submenu
  if (showModelSubmenu) {
    if (filteredModels.length === 0) {
      return (
        <div
          ref={menuRef}
          className="slash-menu"
          data-testid="slash-menu"
          onKeyDown={handleKeyDown}
        >
          <div style={{ padding: "10px 16px", color: "#8E8E93", fontSize: 13 }}>
            No models available
          </div>
        </div>
      );
    }

    return (
      <div
        ref={menuRef}
        className="slash-menu"
        data-testid="slash-menu"
        onKeyDown={handleKeyDown}
      >
        <div
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid #F2F2F7",
            fontSize: 12,
            color: "#8E8E93",
            cursor: "pointer",
          }}
          onClick={() => setShowModelSubmenu(false)}
        >
          ← Back to commands
        </div>
        {filteredModels.map((model, i) => (
          <div
            key={`${model.provider}/${model.id}`}
            data-slash-item
            data-testid={`slash-model-${model.provider}-${model.id}`}
            onClick={() => onSelect(`model ${model.provider}/${model.id}`)}
            style={{
              padding: "10px 16px",
              cursor: "pointer",
              backgroundColor: i === activeIndexRef.current ? "#F2F2F7" : "transparent",
              borderBottom: i < filteredModels.length - 1 ? "1px solid #F2F2F7" : "none",
            }}
            onMouseEnter={() => {
              activeIndexRef.current = i;
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 500 }}>{model.name}</div>
            <div style={{ fontSize: 12, color: "#8E8E93" }}>
              {model.provider}/{model.id}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Main command menu
  if (filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="slash-menu"
      data-testid="slash-menu"
      onKeyDown={handleKeyDown}
    >
      {filtered.map((cmd, i) => (
        <div
          key={cmd.name}
          data-slash-item
          data-testid={`slash-item-${cmd.name}`}
          onClick={() => {
            if (cmd.name === "model") {
              setShowModelSubmenu(true);
              activeIndexRef.current = 0;
            } else {
              onSelect(cmd.name);
            }
          }}
          style={{
            padding: "10px 16px",
            cursor: "pointer",
            backgroundColor: i === activeIndexRef.current ? "#F2F2F7" : "transparent",
            borderBottom: i < filtered.length - 1 ? "1px solid #F2F2F7" : "none",
          }}
          onMouseEnter={() => {
            activeIndexRef.current = i;
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500 }}>/{cmd.name}</div>
          <div style={{ fontSize: 12, color: "#8E8E93" }}>
            {cmd.name === "model" && availableModels.length > 0
              ? `${cmd.description} (${availableModels.length} available)`
              : cmd.description}
          </div>
        </div>
      ))}
    </div>
  );
}