import { useEffect, useRef, useState } from "react";
import type { ModelInfo, SkillInfo } from "../hooks/useRelay";

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
  /** Available skills from pi's command registry. */
  availableSkills: SkillInfo[];
  /** Called when a command should be sent immediately (e.g., model switch). */
  onSelect: (command: string) => void;
  /** Called when a command should be filled in the input (e.g., skill with instructions). */
  onFillInput: (value: string) => void;
  /** Called when the menu should be dismissed. */
  onDismiss: () => void;
}

/** Dropdown menu shown when the user types `/` in the input. */
export function SlashMenu({ input, availableModels, availableSkills, onSelect, onFillInput, onDismiss }: SlashMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);
  const [activeSubmenu, setActiveSubmenu] = useState<"model" | "skill" | null>(null);

  // Parse the input: "/model" or "/model <query>"
  const parts = input.slice(1).split(" ");
  const commandQuery = parts[0]?.toLowerCase() ?? "";
  const submenuQuery = parts.slice(1).join(" ").toLowerCase();

  // Filter commands by prefix
  const filtered = PI_COMMANDS.filter((cmd) => cmd.name.toLowerCase().startsWith(commandQuery));

  // Reset active index and submenu when input changes
  useEffect(() => {
    activeIndexRef.current = 0;
    // Show submenu if user typed "/model " or "/skill " (with space)
    if (commandQuery === "model" && parts.length > 1) {
      setActiveSubmenu("model");
    } else if (commandQuery === "skill" && parts.length > 1) {
      setActiveSubmenu("skill");
    } else if (commandQuery !== "model" && commandQuery !== "skill") {
      setActiveSubmenu(null);
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
      m.name.toLowerCase().includes(submenuQuery) ||
      m.id.toLowerCase().includes(submenuQuery) ||
      m.provider.toLowerCase().includes(submenuQuery),
  );

  // Filter skills by query
  const filteredSkills = availableSkills.filter(
    (s) =>
      s.name.toLowerCase().includes(submenuQuery) ||
      s.description?.toLowerCase().includes(submenuQuery),
  );

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (activeSubmenu) {
        // Go back to command list
        setActiveSubmenu(null);
      } else {
        onDismiss();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const items = activeSubmenu === "model" ? filteredModels : activeSubmenu === "skill" ? filteredSkills : filtered;
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
      if (activeSubmenu === "model") {
        if (filteredModels.length > 0) {
          const model = filteredModels[activeIndexRef.current];
          onSelect(`model ${model.provider}/${model.id}`);
        }
      } else if (activeSubmenu === "skill") {
        if (filteredSkills.length > 0) {
          const skill = filteredSkills[activeIndexRef.current];
          onFillInput(`/skill:${skill.name} `);
        }
      } else {
        if (filtered.length > 0) {
          const cmd = filtered[activeIndexRef.current].name;
          if (cmd === "model") {
            setActiveSubmenu("model");
            activeIndexRef.current = 0;
          } else if (cmd === "skill") {
            setActiveSubmenu("skill");
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
  if (activeSubmenu === "model") {
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
          onClick={() => setActiveSubmenu(null)}
        >
          ← Back to commands
        </div>
        {filteredModels.length === 0 ? (
          <div style={{ padding: "10px 16px", color: "#8E8E93", fontSize: 13 }}>
            No models available
          </div>
        ) : (
          filteredModels.map((model, i) => (
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
          ))
        )}
      </div>
    );
  }

  // Skill submenu
  if (activeSubmenu === "skill") {
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
          onClick={() => setActiveSubmenu(null)}
        >
          ← Back to commands
        </div>
        {filteredSkills.length === 0 ? (
          <div style={{ padding: "10px 16px", color: "#8E8E93", fontSize: 13 }}>
            No skills available
          </div>
        ) : (
          filteredSkills.map((skill, i) => (
            <div
              key={skill.name}
              data-slash-item
              data-testid={`slash-skill-${skill.name}`}
              onClick={() => onFillInput(`/skill:${skill.name} `)}
              style={{
                padding: "10px 16px",
                cursor: "pointer",
                backgroundColor: i === activeIndexRef.current ? "#F2F2F7" : "transparent",
                borderBottom: i < filteredSkills.length - 1 ? "1px solid #F2F2F7" : "none",
              }}
              onMouseEnter={() => {
                activeIndexRef.current = i;
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500 }}>{skill.name}</div>
              {skill.description && (
                <div style={{ fontSize: 12, color: "#8E8E93" }}>{skill.description}</div>
              )}
            </div>
          ))
        )}
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
              setActiveSubmenu("model");
              activeIndexRef.current = 0;
            } else if (cmd.name === "skill") {
              setActiveSubmenu("skill");
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
              : cmd.name === "skill" && availableSkills.length > 0
                ? `${cmd.description} (${availableSkills.length} available)`
                : cmd.description}
          </div>
        </div>
      ))}
    </div>
  );
}