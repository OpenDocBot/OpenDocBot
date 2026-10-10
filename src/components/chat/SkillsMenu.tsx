import { useRef, useState } from "react";
import { ChevronLeft, Download, Pencil, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { getHost } from "../../office";
import type { Skill } from "../../chat/skills/types";
import { HOST_SHORT } from "../../chat/skills/hosts";
import { isSkillAvailable } from "../../chat/skills/availability";
import { exportSkillsZip, parseSkillsFile, SKILLS_PACK_FILE_NAME } from "../../chat/skills/transfer";
import { useSkillsStore } from "../../store/skillsStore";
import { downloadBlob } from "../../lib/download";
import { SkillEditorDialog } from "./SkillEditorDialog";

interface SkillsMenuProps {
  /** Called when an action should dismiss the parent menu (e.g. export/import). */
  onCloseMenu: () => void;
  /** When provided, shows a back button in the header to return to the root menu. */
  onBack?: () => void;
}

/**
 * The skills panel of the add-menu: the whole library with per-app availability
 * badges (skills that don't apply to the current host are dimmed), plus
 * create/edit and export/import. Rendered inside the parent `role="menu"`.
 */
export function SkillsMenu({ onCloseMenu, onBack }: SkillsMenuProps) {
  const skills = useSkillsStore((s) => s.skills);
  const importSkills = useSkillsStore((s) => s.importSkills);
  const host = getHost();

  const [editor, setEditor] = useState<{ skill: Skill | null } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  async function handleExport() {
    onCloseMenu();
    if (skills.length === 0) return;
    try {
      downloadBlob(SKILLS_PACK_FILE_NAME, await exportSkillsZip(skills));
    } catch {
      toast.error("Could not export skills.");
    }
  }

  async function handleImportFile(file: File | null | undefined) {
    if (!file) return;
    try {
      const imported = await parseSkillsFile(file);
      if (imported.length === 0) {
        toast.error("No valid skills found in the file.");
      } else {
        importSkills(imported);
        toast.success(`Imported ${imported.length} skill${imported.length === 1 ? "" : "s"}.`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      onCloseMenu();
    }
  }

  return (
    <>
      <div className="flex items-center gap-1 border-b border-border px-1 py-1">
        {onBack && (
          <button
            type="button"
            role="menuitem"
            onClick={onBack}
            aria-label="Back"
            className="grid h-6 w-6 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Skills
        </span>
      </div>

      {skills.length === 0 ? (
        <p className="px-3 py-1.5 text-muted-foreground">No skills yet</p>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          {skills.map((skill) => {
            const applies = isSkillAvailable(skill, host);
            return (
              <div
                key={skill.id}
                className={`flex items-start gap-2 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground ${
                  applies ? "" : "opacity-40"
                }`}
              >
                <div className="min-w-0 flex-1" title={skill.description}>
                  <span className="block truncate">{skill.name}</span>
                  {skill.description && (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {skill.description}
                    </span>
                  )}
                  <span className="mt-0.5 flex gap-1">
                    {skill.hosts.map((h) => (
                      <span
                        key={h}
                        className="border border-border px-1 text-[9px] uppercase leading-4 text-muted-foreground"
                      >
                        {HOST_SHORT[h]}
                      </span>
                    ))}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`Edit ${skill.name}`}
                  onClick={() => setEditor({ skill })}
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        role="menuitem"
        onClick={() => setEditor({ skill: null })}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        New skill
      </button>

      <div role="separator" className="my-1 border-t border-border" />

      <button
        type="button"
        role="menuitem"
        onClick={handleExport}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
      >
        <Download className="h-3.5 w-3.5" />
        Export skills
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => importInputRef.current?.click()}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
      >
        <Upload className="h-3.5 w-3.5" />
        Import skills
      </button>

      <input
        ref={importInputRef}
        type="file"
        accept=".zip,.md,.json,application/zip,text/markdown,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          void handleImportFile(file);
        }}
      />

      {editor && (
        <SkillEditorDialog skill={editor.skill} onClose={() => setEditor(null)} />
      )}
    </>
  );
}
