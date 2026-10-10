import { useEffect, useRef, useState } from "react";
import { ChevronRight, Paperclip, Sparkles } from "lucide-react";
import { useSkillsStore } from "../../store/skillsStore";
import { availableSkills } from "../../chat/skills/availability";
import { getHost } from "../../office";
import { SkillsMenu } from "./SkillsMenu";

interface AddMenuProps {
  /** Disable the trigger while a turn is in flight. */
  disabled?: boolean;
  /** Invoked when the user picks "Attach file" (opens the hidden file input). */
  onAttachFile: () => void;
}

type MenuView = "root" | "skills";

/**
 * The "+" add-menu next to the chat input. The root lists "Attach file" and
 * "Skills"; picking Skills drills down into the skills panel in place (with a
 * back button), keeping the root menu compact and within the taskpane bounds.
 */
export function AddMenu({ disabled, onAttachFile }: AddMenuProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>("root");
  const menuRef = useRef<HTMLDivElement>(null);
  const skills = useSkillsStore((s) => s.skills);
  const availableCount = availableSkills(skills, getHost()).length;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setView("root");
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setView("root");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setView("root");
  }

  function toggle() {
    setView("root");
    setOpen((v) => !v);
  }

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add"
        title="Add"
        className="group relative grid h-8 w-7 place-items-center text-primary disabled:opacity-40"
      >
        <span
          className={`pointer-events-none absolute inset-0 grid place-items-center text-base leading-none transition-all duration-200 ${
            open
              ? "-rotate-90 scale-0 opacity-0"
              : "rotate-0 scale-100 opacity-100 group-hover:-rotate-90 group-hover:scale-0 group-hover:opacity-0"
          }`}
        >
          ❯
        </span>
        <span
          className={`pointer-events-none absolute inset-0 grid place-items-center text-xl font-bold leading-none transition-all duration-200 ${
            open
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-0 opacity-0 group-hover:rotate-0 group-hover:scale-100 group-hover:opacity-100"
          }`}
        >
          +
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute bottom-full left-0 z-40 mb-2 border border-border bg-card font-mono text-xs shadow-lg ${
            view === "skills" ? "w-64" : "w-56"
          }`}
        >
          {view === "root" ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onAttachFile();
                  close();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <Paperclip className="w-3.5 h-3.5" />
                Attach file
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setView("skills")}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Skills
                {availableCount > 0 && (
                  <span className="text-muted-foreground">({availableCount})</span>
                )}
                <ChevronRight className="ml-auto w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </>
          ) : (
            <SkillsMenu onCloseMenu={close} onBack={() => setView("root")} />
          )}
        </div>
      )}
    </div>
  );
}
