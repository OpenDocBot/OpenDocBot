import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  exportMcpServersJson,
  MCP_CREDENTIALS_WARNING,
  MCP_SERVERS_CREDENTIALS_FILE_NAME,
  MCP_SERVERS_FILE_NAME,
} from "../../mcp/transfer";
import type { McpServerConfig } from "../../mcp/types";
import { downloadTextFile } from "../../lib/download";
import { Button } from "@/components/ui/button";

interface ExportMcpDialogProps {
  servers: McpServerConfig[];
  onClose: () => void;
}

/**
 * Export the configured MCP servers to a file. Credentials (API-key value and
 * OAuth client secret) are opt-in and clearly flagged, since the file is plain
 * text. OAuth tokens are never exported.
 */
export function ExportMcpDialog({ servers, onClose }: ExportMcpDialogProps) {
  const [includeCredentials, setIncludeCredentials] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleExport() {
    const json = exportMcpServersJson(servers, { includeCredentials });
    downloadTextFile(
      includeCredentials ? MCP_SERVERS_CREDENTIALS_FILE_NAME : MCP_SERVERS_FILE_NAME,
      json,
    );
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Export MCP servers"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border border-border bg-card font-mono text-xs shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="uppercase tracking-wider text-muted-foreground">Export servers</span>
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
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeCredentials}
              onChange={(e) => setIncludeCredentials(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span>Include credentials (API keys &amp; client secrets)</span>
          </label>
          {includeCredentials && (
            <p role="alert" className="text-amber-500">
              {MCP_CREDENTIALS_WARNING}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleExport}>
            Export
          </Button>
        </div>
      </div>
    </div>
  );
}
