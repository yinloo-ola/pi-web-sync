import { useEffect, useRef } from "react";

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
  /** Called when a command is selected. The full command string is passed (e.g., "model"). */
  onSelect: (command: string) => void;
  /** Called when the menu should be dismissed. */
  onDismiss: () => void;
}

/** Dropdown menu shown when the user types `/` in the input. */
export function SlashMenu({ input, onSelect, onDismiss }: SlashMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);

  // Filter commands by prefix (input without the leading `/`)
  const query = input.slice(1).toLowerCase();
  const filtered = PI_COMMANDS.filter((cmd) => cmd.name.toLowerCase().startsWith(query));

  // Reset active index when filter changes
  useEffect(() => {
    activeIndexRef.current = 0;
  }, [query]);

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

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onDismiss();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndexRef.current = Math.min(activeIndexRef.current + 1, filtered.length - 1);
      // Force re-render by triggering a DOM update
      const items = menuRef.current?.querySelectorAll("[data-slash-item]");
      items?.[activeIndexRef.current]?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndexRef.current = Math.max(activeIndexRef.current - 1, 0);
      const items = menuRef.current?.querySelectorAll("[data-slash-item]");
      items?.[activeIndexRef.current]?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0) {
        onSelect(filtered[activeIndexRef.current].name);
      }
      return;
    }
  }

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
          onClick={() => onSelect(cmd.name)}
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
          <div style={{ fontSize: 12, color: "#8E8E93" }}>{cmd.description}</div>
        </div>
      ))}
    </div>
  );
}