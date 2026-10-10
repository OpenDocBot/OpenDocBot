import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { createSkill, ALL_HOSTS, type Skill } from "../../chat/skills/types";
import type { Host } from "../../office";
import { HOST_OPTIONS, HOST_SHORT } from "../../chat/skills/hosts";
import { slugify } from "../../chat/skills/slug";
import {
  MAX_SKILL_DESCRIPTION,
  MAX_SKILL_INSTRUCTIONS,
  MAX_SKILL_NAME,
} from "../../chat/skills/config";
import { useSkillsStore } from "../../store/skillsStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface SkillEditorDialogProps {
  /** Skill to edit, or null to create a new one. */
  skill: Skill | null;
  onClose: () => void;
}

/**
 * Create/edit/delete a single skill. Rendered while the add-menu is open, so the
 * overlay sits above the menu (`z-50` over the menu's `z-40`).
 */
export function SkillEditorDialog({ skill, onClose }: SkillEditorDialogProps) {
  const addSkill = useSkillsStore((s) => s.addSkill);
  const updateSkill = useSkillsStore((s) => s.updateSkill);
  const removeSkill = useSkillsStore((s) => s.removeSkill);

  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [instructions, setInstructions] = useState(skill?.instructions ?? "");
  const [hosts, setHosts] = useState<Host[]>(skill?.hosts ?? [...ALL_HOSTS]);
  const [error, setError] = useState("");
  const slugPreview = slugify(name);

  function toggleHost(host: Host) {
    setHosts((prev) =>
      prev.includes(host) ? prev.filter((h) => h !== host) : [...prev, host],
    );
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSave() {
    const trimmedName = name.trim();
    const trimmedInstructions = instructions.trim();
    const trimmedDescription = description.trim();

    if (!trimmedName) return setError("Name is required.");
    if (trimmedName.length > MAX_SKILL_NAME) {
      return setError(`Name must be ${MAX_SKILL_NAME} characters or fewer.`);
    }
    if (!trimmedDescription) {
      return setError("Description is required — it tells the assistant when to use the skill.");
    }
    if (trimmedDescription.length > MAX_SKILL_DESCRIPTION) {
      return setError(`Description must be ${MAX_SKILL_DESCRIPTION} characters or fewer.`);
    }
    if (!trimmedInstructions) return setError("Instructions are required.");
    if (trimmedInstructions.length > MAX_SKILL_INSTRUCTIONS) {
      return setError(`Instructions must be ${MAX_SKILL_INSTRUCTIONS} characters or fewer.`);
    }
    if (hosts.length === 0) return setError("Select at least one app where the skill is available.");

    if (skill) {
      updateSkill(skill.id, {
        name: trimmedName,
        description: trimmedDescription,
        instructions: trimmedInstructions,
        hosts,
      });
    } else {
      addSkill(createSkill(trimmedName, trimmedDescription, trimmedInstructions, hosts));
    }
    onClose();
  }

  function handleDelete() {
    if (!skill) return;
    removeSkill(skill.id);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={skill ? "Edit skill" : "New skill"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border border-border bg-card font-mono text-xs shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="uppercase tracking-wider text-muted-foreground">
            {skill ? "Edit skill" : "New skill"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="skillName">Name</Label>
            <Input
              id="skillName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_SKILL_NAME}
              placeholder="e.g. Concise answers"
            />
            {name.trim() && (
              <span className="text-[10px] text-muted-foreground">
                Invoke with <span className="text-primary">/{slugPreview}</span>
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="skillDescription">Description</Label>
            <Input
              id="skillDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={MAX_SKILL_DESCRIPTION}
              placeholder="What it does and when to use it"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="skillInstructions">Instructions</Label>
            <Textarea
              id="skillInstructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={6}
              maxLength={MAX_SKILL_INSTRUCTIONS}
              placeholder="What should the assistant do when this skill is active?"
              className="resize-none"
            />
            <span className="text-[10px] text-muted-foreground">
              Tip: you can include Office.js snippets as reference for the assistant.
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Available in</Label>
            <div className="flex flex-wrap gap-1.5">
              {HOST_OPTIONS.map((option) => {
                const selected = hosts.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    aria-label={option.label}
                    title={option.label}
                    onClick={() => toggleHost(option.value)}
                    className={`grid h-7 w-7 place-items-center border text-[10px] uppercase ${
                      selected
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {HOST_SHORT[option.value]}
                  </button>
                );
              })}
            </div>
          </div>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border p-3">
          {skill ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
