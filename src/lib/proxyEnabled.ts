/**
 * Whether the `/proxy/` route exists in this deployment. Self-hosted and dev
 * builds enable it (checkbox shown, OpenCode Zen preset available); static
 * GitHub Pages builds set VITE_PROXY_ENABLED=false.
 */
export function isProxyEnabled(): boolean {
  return import.meta.env.VITE_PROXY_ENABLED === "true" || import.meta.env.DEV;
}
