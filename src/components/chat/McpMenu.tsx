import { useRef, useState } from "react";
import { ChevronLeft, Download, Pencil, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import type { McpServerConfig } from "../../mcp/types";
import { parseMcpServersFile } from "../../mcp/transfer";
import { useMcpStore } from "../../store/mcpStore";
import { useChatStore } from "../../store/chatStore";
import { McpServerDialog } from "./McpServerDialog";
import { ExportMcpDialog } from "./ExportMcpDialog";

interface McpMenuProps {
  /** Called when an action should dismiss the parent menu (e.g. export/import). */
  onCloseMenu: () => void;
  /** When provided, shows a back button in the header to return to the root menu. */
  onBack?: () => void;
}

/**
 * The MCP servers panel of the add-menu: the configured servers with a
 * per-conversation enable toggle, plus add/edit and export/import. Rendered
 * inside the parent `role="menu"`.
 */
export function McpMenu({ onCloseMenu, onBack }: McpMenuProps) {
  const servers = useMcpStore((s) => s.servers);
  const importServers = useMcpStore((s) => s.importServers);
  const enabledIds = useChatStore((s) => s.enabledMcpServerIds);
  const toggleMcpServer = useChatStore((s) => s.toggleMcpServer);

  const [editor, setEditor] = useState<{ server: McpServerConfig | null } | null>(null);
  const [exporting, setExporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  function handleExport() {
    if (servers.length === 0) return;
    setExporting(true);
  }

  async function handleImportFile(file: File | null | undefined) {
    if (!file) return;
    try {
      const imported = await parseMcpServersFile(file);
      if (imported.length === 0) {
        toast.error("No valid servers found in the file.");
      } else {
        importServers(imported);
        toast.success(`Imported ${imported.length} server${imported.length === 1 ? "" : "s"}.`);
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
          MCP servers
        </span>
      </div>

      {servers.length === 0 ? (
        <p className="px-3 py-1.5 text-muted-foreground">No servers yet</p>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          {servers.map((server) => {
            const enabled = enabledIds.includes(server.id);
            return (
              <div
                key={server.id}
                className="flex items-start gap-2 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground"
              >
                <input
                  id={`mcp-toggle-${server.id}`}
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleMcpServer(server.id)}
                  className="mt-0.5 accent-primary"
                />
                <label
                  htmlFor={`mcp-toggle-${server.id}`}
                  className="min-w-0 flex-1 cursor-pointer"
                  title={server.url}
                >
                  <span className="block truncate">{server.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {server.url}
                  </span>
                </label>
                {server.auth.type !== "none" && (
                  <span className="mt-0.5 shrink-0 border border-border px-1 text-[9px] uppercase leading-4 text-muted-foreground">
                    {server.auth.type === "apiKey" ? "key" : "oauth"}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Edit ${server.name}`}
                  onClick={() => setEditor({ server })}
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
        onClick={() => setEditor({ server: null })}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        New server
      </button>

      <div role="separator" className="my-1 border-t border-border" />

      <button
        type="button"
        role="menuitem"
        onClick={handleExport}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
      >
        <Download className="h-3.5 w-3.5" />
        Export servers
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => importInputRef.current?.click()}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
      >
        <Upload className="h-3.5 w-3.5" />
        Import servers
      </button>

      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          void handleImportFile(file);
        }}
      />

      {editor && (
        <McpServerDialog server={editor.server} onClose={() => setEditor(null)} />
      )}
      {exporting && (
        <ExportMcpDialog servers={servers} onClose={() => setExporting(false)} />
      )}
    </>
  );
}
