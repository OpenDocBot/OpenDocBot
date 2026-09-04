/**
 * Stable, per-conversation session id.
 *
 * Used to fill the `$SESSION_ID` variable in custom headers (e.g. OpenCode's
 * `x-opencode-session`). Persisted in localStorage so it survives taskpane
 * reloads, and regenerated when the user clears the conversation.
 */

const SESSION_KEY = "opendocbot-session-id";

export function getSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // Storage unavailable (e.g. private browsing): fall back to a per-load id.
    return crypto.randomUUID();
  }
}

export function resetSessionId(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}