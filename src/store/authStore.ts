import { create } from "zustand";

export interface AuthUser {
  sub: string;
  email?: string | null;
  name?: string | null;
  groups?: string[];
}

export type AuthStatus = "notRequired" | "signedOut" | "signedIn";

interface AuthState {
  status: AuthStatus;
  sid: string | null;
  user: AuthUser | null;
  setNotRequired: () => void;
  setSignedOut: () => void;
  setSignedIn: (sid: string, user: AuthUser) => void;
}

/**
 * Authentication state for self-hosted SSO instances. `notRequired` is the
 * default (no SSO configured); `signedOut` drives the full-app sign-in gate.
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: "notRequired",
  sid: null,
  user: null,
  setNotRequired: () => set({ status: "notRequired", sid: null, user: null }),
  setSignedOut: () => set({ status: "signedOut", sid: null, user: null }),
  setSignedIn: (sid, user) => set({ status: "signedIn", sid, user }),
}));
