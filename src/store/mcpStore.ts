import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { McpAuth, McpServerConfig } from "../mcp/types";

interface McpState {
  /** Configured MCP servers (local to this install). */
  servers: McpServerConfig[];
  addServer: (server: McpServerConfig) => void;
  updateServer: (id: string, patch: Partial<Omit<McpServerConfig, "id">>) => void;
  removeServer: (id: string) => void;
  /**
   * Merge imported servers, matching by URL. A matched server keeps its id and,
   * for API-key auth, its existing secret when the imported value is empty.
   */
  importServers: (servers: McpServerConfig[]) => void;
}

function mergeAuth(existing: McpAuth, incoming: McpAuth): McpAuth {
  if (incoming.type === "apiKey" && existing.type === "apiKey" && !incoming.value) {
    return { ...incoming, value: existing.value };
  }
  if (incoming.type === "oauth" && existing.type === "oauth" && !incoming.clientSecret) {
    return { ...incoming, clientSecret: existing.clientSecret };
  }
  return incoming;
}

export const useMcpStore = create<McpState>()(
  persist(
    (set) => ({
      servers: [],

      addServer: (server) => set((s) => ({ servers: [...s.servers, server] })),

      updateServer: (id, patch) =>
        set((s) => ({
          servers: s.servers.map((server) =>
            server.id === id ? { ...server, ...patch, id } : server,
          ),
        })),

      removeServer: (id) =>
        set((s) => ({ servers: s.servers.filter((server) => server.id !== id) })),

      importServers: (incoming) =>
        set((s) => {
          const servers = s.servers.map((server) => ({ ...server }));
          for (const inc of incoming) {
            const idx = servers.findIndex((server) => server.url === inc.url);
            if (idx >= 0) {
              const existing = servers[idx];
              servers[idx] = {
                ...inc,
                id: existing.id,
                auth: mergeAuth(existing.auth, inc.auth),
              };
            } else {
              servers.push(inc);
            }
          }
          return { servers };
        }),
    }),
    {
      name: "opendocbot-mcp",
      version: 1,
      partialize: (state) => ({ servers: state.servers }),
    },
  ),
);
