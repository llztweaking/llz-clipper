import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { logoutRequest } from "../services/authApi";
import type { AuthUser } from "../types";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  sessionExpired: boolean;
  setSession: (accessToken: string, refreshToken: string, user: AuthUser) => void;
  setAccessToken: (accessToken: string) => void;
  sessionExpiredNow: () => void;
  clearSessionExpired: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  sessionExpired: false,

  setSession: (accessToken, refreshToken, user) => {
    set({ accessToken, refreshToken, user, sessionExpired: false });
  },

  setAccessToken: (accessToken) => set({ accessToken }),

  sessionExpiredNow: () => {
    set({ accessToken: null, refreshToken: null, user: null, sessionExpired: true });
    void invoke("clear_session");
  },

  clearSessionExpired: () => set({ sessionExpired: false }),

  logout: async () => {
    const { refreshToken } = get();
    if (refreshToken) {
      try {
        await logoutRequest(refreshToken);
      } catch {
        // best-effort — proceed to clear local state regardless
      }
    }
    await invoke("clear_session");
    set({ accessToken: null, refreshToken: null, user: null, sessionExpired: false });
  },
}));
