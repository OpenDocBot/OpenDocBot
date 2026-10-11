import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createMcpServer, type McpAuth, type McpServerConfig } from "../../mcp/types";
import { runOAuthFlow } from "../../mcp/oauth/flow";
import { openAuthDialog } from "../../mcp/oauth/dialog";
import { useMcpTokenStore } from "../../mcp/oauth/tokenStore";
import { testServerConnection } from "../../mcp/manager";
import { useMcpStore } from "../../store/mcpStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface McpServerDialogProps {
  /** Server to edit, or null to create a new one. */
  server: McpServerConfig | null;
  onClose: () => void;
}

const AUTH_OPTIONS = [
  { value: "none", label: "No auth" },
  { value: "apiKey", label: "API key / bearer" },
  { value: "oauth", label: "OAuth" },
];

/**
 * Create/edit/delete a single MCP server. Rendered while the add-menu is open,
 * so the overlay sits above the menu (`z-50` over the menu's `z-40`).
 */
export function McpServerDialog({ server, onClose }: McpServerDialogProps) {
  const addServer = useMcpStore((s) => s.addServer);
  const updateServer = useMcpStore((s) => s.updateServer);
  const removeServer = useMcpStore((s) => s.removeServer);

  const [current, setCurrent] = useState<McpServerConfig | null>(server);
  const [name, setName] = useState(server?.name ?? "");
  const [url, setUrl] = useState(server?.url ?? "");
  const [authType, setAuthType] = useState<"none" | "apiKey" | "oauth">(
    server?.auth.type ?? "none",
  );
  const [header, setHeader] = useState(
    server?.auth.type === "apiKey" ? server.auth.header : "Authorization",
  );
  const [value, setValue] = useState(server?.auth.type === "apiKey" ? server.auth.value : "");
  const [clientId, setClientId] = useState(
    server?.auth.type === "oauth" ? (server.auth.clientId ?? "") : "",
  );
  const [clientSecret, setClientSecret] = useState(
    server?.auth.type === "oauth" ? (server.auth.clientSecret ?? "") : "",
  );
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [justConnected, setJustConnected] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const connected = useMcpTokenStore((s) => (current ? Boolean(s.tokens[current.id]) : false));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function buildAuth(): McpAuth {
    if (authType === "apiKey") {
      return { type: "apiKey", header: header.trim() || "Authorization", value: value.trim() };
    }
    if (authType === "oauth") {
      return {
        type: "oauth",
        ...(clientId.trim() ? { clientId: clientId.trim() } : {}),
        ...(clientSecret ? { clientSecret } : {}),
      };
    }
    return { type: "none" };
  }

  /** Validate and create/update the server. Returns it, or null on error. */
  function persist(): McpServerConfig | null {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return null;
    }
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      setError("Enter a valid http(s) URL.");
      return null;
    }
    if (authType === "apiKey" && !value.trim() && !(current?.auth.type === "apiKey" && current.auth.value)) {
      setError("Enter the API key / token value.");
      return null;
    }
    const auth = buildAuth();
    if (current) {
      updateServer(current.id, { name: trimmedName, url: trimmedUrl, auth });
      return { ...current, name: trimmedName, url: trimmedUrl, auth };
    }
    const created = { ...createMcpServer(trimmedName, trimmedUrl), auth };
    addServer(created);
    setCurrent(created);
    return created;
  }

  function handleSave() {
    setError("");
    if (persist()) onClose();
  }

  async function handleConnect() {
    setError("");
    const target = persist();
    if (!target) return;
    setConnecting(true);
    try {
      const token = await runOAuthFlow(target.url, {
        openDialog: openAuthDialog,
        clientId: clientId.trim(),
        clientSecret: clientSecret || undefined,
      });
      useMcpTokenStore.getState().setToken(target.id, token);
      setJustConnected(true);
      toast.success("Connected.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleTest() {
    setError("");
    setTestResult(null);
    const target = persist();
    if (!target) return;
    setTesting(true);
    const result = await testServerConnection(target);
    setTesting(false);
    setTestResult(
      result.ok
        ? {
            ok: true,
            message: `Connected — ${result.toolCount} tool${result.toolCount === 1 ? "" : "s"}.`,
          }
        : { ok: false, message: result.error ?? "Connection failed." },
    );
  }

  function handleDisconnect() {
    if (!current) return;
    useMcpTokenStore.getState().clearToken(current.id);
    setJustConnected(false);
  }

  function handleDelete() {
    if (!current) return;
    removeServer(current.id);
    useMcpTokenStore.getState().clearToken(current.id);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={server ? "Edit MCP server" : "New MCP server"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border border-border bg-card font-mono text-xs shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="uppercase tracking-wider text-muted-foreground">
            {server ? "Edit server" : "New server"}
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
            <Label htmlFor="mcpName">Name</Label>
            <Input
              id="mcpName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GitHub"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mcpUrl">Server URL</Label>
            <Input
              id="mcpUrl"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Authentication</Label>
            <Select
              value={authType}
              onValueChange={(v) =>
                setAuthType(v === "apiKey" ? "apiKey" : v === "oauth" ? "oauth" : "none")
              }
              options={AUTH_OPTIONS}
              className="h-8 text-xs"
            />
          </div>

          {authType === "apiKey" && (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor="mcpHeader">Header</Label>
                <Input
                  id="mcpHeader"
                  value={header}
                  onChange={(e) => setHeader(e.target.value)}
                  placeholder="Authorization"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="mcpValue">Value</Label>
                <Input
                  id="mcpValue"
                  type="password"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Bearer …"
                />
              </div>
            </>
          )}

          {authType === "oauth" && (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor="mcpClientId">Client ID (optional)</Label>
                <Input
                  id="mcpClientId"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Blank → dynamic registration"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="mcpClientSecret">Client Secret (optional)</Label>
                <Input
                  id="mcpClientSecret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="For confidential clients"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" disabled={connecting} onClick={handleConnect}>
                  {connecting ? "Connecting…" : connected || justConnected ? "Reconnect" : "Connect"}
                </Button>
                {(connected || justConnected) && (
                  <span className="text-primary">● Connected</span>
                )}
                {connected && !justConnected && (
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {testResult && (
            <p className={testResult.ok ? "text-primary" : "text-destructive"}>
              {testResult.ok ? "● " : "✕ "}
              {testResult.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border p-3">
          {current ? (
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testing}
              onClick={handleTest}
            >
              {testing ? "Testing…" : "Test"}
            </Button>
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
