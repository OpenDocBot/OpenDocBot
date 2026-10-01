import { debugLog } from "./debugLog";
import { clearManagedConfigCache } from "./managedConfig";
import { useAuthStore, type AuthUser } from "../store/authStore";

/**
 * Client side of the self-hosted OIDC flow. The browser never sees IdP tokens:
 * sign-in runs in the Office dialog, and only a short-lived opaque session id
 * comes back via messageParent. See docs/enterprise/sso.
 */

const SID_KEY = "opendocbot-session-id";
const SESSION_TIMEOUT_MS = 5000;

export function getStoredSid(): string | null {
  try {
    return localStorage.getItem(SID_KEY);
  } catch {
    return null;
  }
}

function storeSid(sid: string): void {
  try {
    localStorage.setItem(SID_KEY, sid);
  } catch {
    /* storage unavailable */
  }
}

export function clearStoredSid(): void {
  try {
    localStorage.removeItem(SID_KEY);
  } catch {
    /* storage unavailable */
  }
}

function inOffice(): boolean {
  return typeof Office !== "undefined" && Boolean(Office.context?.ui);
}

/**
 * Outcome of validating the stored session. `invalid` means the server
 * rejected the session (401/403) and the caller should discard it. `unreachable`
 * means the server could not be reached or answered with 5xx: the session may
 * still be valid, so the caller must NOT delete it (a transient outage would
 * otherwise sign the user out).
 */
export type SessionCheck =
  | { state: "valid"; sid: string; user: AuthUser }
  | { state: "invalid" }
  | { state: "unreachable" };

/** Validate the stored session against the server and return the user. */
export async function checkSession(): Promise<SessionCheck> {
  const sid = getStoredSid();
  if (!sid) return { state: "invalid" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);
  try {
    const res = await fetch("/auth/session", {
      headers: { Authorization: `Bearer ${sid}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) return { state: "invalid" };
    if (!res.ok) return { state: "unreachable" };
    const data = (await res.json()) as { user: AuthUser };
    return { state: "valid", sid, user: data.user };
  } catch {
    return { state: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Open the sign-in dialog. `dialogOpened` on the error distinguishes "never
 * opened" (e.g. a blocked popup, safe to retry) from "opened then closed by the
 * user" (do not retry).
 */
class DialogError extends Error {
  dialogOpened: boolean;
  constructor(message: string, dialogOpened: boolean) {
    super(message);
    this.name = "DialogError";
    this.dialogOpened = dialogOpened;
  }
}

function openDialog(
  url: string,
  promptBeforeOpen: boolean
): Promise<{ sid: string; user: AuthUser }> {
  return new Promise<{ sid: string; user: AuthUser }>((resolve, reject) => {
    Office.context.ui.displayDialogAsync(
      url,
      { height: 70, width: 45, displayInIframe: false, promptBeforeOpen },
      (result) => {
        if (result.status === Office.AsyncResultStatus.Failed) {
          reject(new DialogError(`${result.error?.code} ${result.error?.message}`, false));
          return;
        }
        const dialog = result.value;
        dialog.addEventHandler(Office.EventType.DialogMessageReceived, (args) => {
          if (!("message" in args)) {
            reject(new DialogError("unexpected dialog message", true));
            return;
          }
          try {
            const parsed = JSON.parse(args.message) as { sid: string; user: AuthUser };
            storeSid(parsed.sid);
            // Flip the app out of the sign-in gate immediately; the caller still
            // refreshes the managed config afterwards.
            useAuthStore.getState().setSignedIn(parsed.sid, parsed.user);
            dialog.close();
            resolve({ sid: parsed.sid, user: parsed.user });
          } catch (err) {
            reject(err as Error);
          }
        });
        dialog.addEventHandler(Office.EventType.DialogEventReceived, (args) => {
          const code = "error" in args ? args.error : "unknown";
          reject(new DialogError(`sign-in dialog closed (${code})`, true));
        });
      }
    );
  });
}

/**
 * Run the interactive sign-in. In Office, opens the dialog and waits for the
 * session id. Outside Office (browser dev), performs a top-level redirect; the
 * completion page stores the session and returns to the app.
 */
export async function signIn(): Promise<{ sid: string; user: AuthUser }> {
  if (!inOffice()) {
    debugLog("info", "[auth] not in Office: redirecting to /auth/start");
    window.location.assign("/auth/start");
    return new Promise(() => {
      /* navigation replaces the page */
    });
  }
  if (typeof Office.context.ui.displayDialogAsync !== "function") {
    throw new Error("Office dialog API unavailable");
  }

  const url = `${location.origin}/auth/start`;
  // Avoid Office's "wants to display a new window" prompt. The click gesture is
  // still active, so the popup is normally allowed; if it is blocked the dialog
  // never opens, and we retry once with the framework prompt.
  try {
    return await openDialog(url, false);
  } catch (err) {
    if (err instanceof DialogError && !err.dialogOpened) {
      debugLog("info", "[auth] dialog failed without prompt; retrying with prompt");
      return await openDialog(url, true);
    }
    throw err;
  }
}

/** Drop the session locally and on the server. */
export async function signOut(): Promise<void> {
  const sid = getStoredSid();
  if (sid) {
    try {
      await fetch("/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${sid}` },
      });
    } catch {
      /* best effort */
    }
  }
  clearStoredSid();
  clearManagedConfigCache();
  useAuthStore.getState().setSignedOut();
}
