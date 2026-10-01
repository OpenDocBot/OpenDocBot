import {
  loadManagedConfig,
  readManagedBootstrap,
  clearManagedConfigCache,
  type ManagedConfigLoad,
} from "./managedConfig";
import { useManagedConfigStore } from "../store/managedConfigStore";
import { useAuthStore } from "../store/authStore";
import { checkSession, clearStoredSid, getStoredSid, type SessionCheck } from "./auth";

/**
 * Initialize managed mode before the app renders.
 *
 * The server injects a bootstrap marker into index.html on managed and/or SSO
 * instances, so an unmanaged deployment never probes /app-config.json at all.
 * The marker separates two concerns: `managed` (fetch the config) and `sso`
 * (require a session). SSO without a managed config still shows a sign-in gate
 * but never calls the config endpoint. See
 * docs/enterprise/managed-configuration and docs/enterprise/sso.
 */

function applyConfigResult(result: ManagedConfigLoad): void {
  const store = useManagedConfigStore.getState();
  switch (result.state) {
    case "managed":
      store.setManaged(result.payload);
      break;
    case "unmanaged":
      store.setUnmanaged();
      break;
    case "unavailable":
      store.setUnavailable(result.payload);
      break;
    case "unauthorized":
      // Handled by the caller (auth store), nothing to apply here.
      break;
  }
}

/** Validate the session, retrying once on a transient (unreachable) failure. */
async function checkSessionWithRetry(attempts = 2): Promise<SessionCheck> {
  let result = await checkSession();
  for (let attempt = 1; attempt < attempts && result.state === "unreachable"; attempt++) {
    result = await checkSession();
  }
  return result;
}

export async function initManagedConfig(): Promise<void> {
  const authStore = useAuthStore.getState();
  const boot = readManagedBootstrap();
  // Remember that this deployment is managed even if the config never loads,
  // so the UI can keep a retry affordance.
  useManagedConfigStore.getState().setManagedInstance(boot.managed);

  if (!boot.managed && !boot.sso) {
    useManagedConfigStore.getState().setUnmanaged();
    authStore.setNotRequired();
    return;
  }

  if (boot.sso) {
    const sid = getStoredSid();
    if (!sid) {
      authStore.setSignedOut();
      return;
    }
    const session = await checkSessionWithRetry();
    if (session.state === "invalid") {
      clearStoredSid();
      clearManagedConfigCache();
      authStore.setSignedOut();
      return;
    }
    if (session.state === "unreachable") {
      // Keep the stored session id: a transient outage must not sign the user
      // out. Show the gate until the server can confirm the session.
      authStore.setSignedOut();
      return;
    }
    authStore.setSignedIn(session.sid, session.user);
    if (boot.managed) {
      applyConfigResult(
        await loadManagedConfig(fetch, location.origin, { authToken: session.sid })
      );
    } else {
      useManagedConfigStore.getState().setUnmanaged();
    }
    return;
  }

  applyConfigResult(await loadManagedConfig());
}

/** Outcome of a refresh, so callers can react (e.g. show an error). */
export type RefreshOutcome = ManagedConfigLoad["state"];

/**
 * Re-fetch the managed config for the current session (used after signing in,
 * and by the header's refresh button). Falls back to the sign-in gate when the
 * session is missing or rejected; a transient outage keeps the session id.
 * Returns the load outcome so the caller can distinguish success from failure.
 */
export async function refreshManagedConfig(): Promise<RefreshOutcome> {
  const authStore = useAuthStore.getState();
  const boot = readManagedBootstrap();
  const sid = authStore.sid ?? getStoredSid();

  if (boot.sso) {
    if (!sid) {
      authStore.setSignedOut();
      return "unauthorized";
    }
    const session = await checkSessionWithRetry();
    if (session.state === "invalid") {
      clearStoredSid();
      clearManagedConfigCache();
      authStore.setSignedOut();
      return "unauthorized";
    }
    if (session.state === "valid") {
      authStore.setSignedIn(session.sid, session.user);
    }
    // unreachable: keep the session the caller already has.
  }

  if (!boot.managed) {
    useManagedConfigStore.getState().setUnmanaged();
    return "unmanaged";
  }

  const result = await loadManagedConfig(fetch, location.origin, { authToken: sid ?? null });
  if (result.state === "unauthorized") {
    clearStoredSid();
    clearManagedConfigCache();
    authStore.setSignedOut();
    return "unauthorized";
  }
  applyConfigResult(result);
  return result.state;
}
