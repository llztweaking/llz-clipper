import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAuthStore } from "../stores/authStore";
import * as authApi from "../services/authApi";

export function useAuth() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const sessionExpired = useAuthStore((state) => state.sessionExpired);
  const setSession = useAuthStore((state) => state.setSession);
  const logoutStore = useAuthStore((state) => state.logout);

  const activate = useCallback(
    async (code: string, email: string, password: string) => {
      const hwid = await invoke<string>("get_hwid");
      const result = await authApi.activateKey({ code, email, password, hwid });
      await invoke("save_session", { refreshToken: result.refreshToken });
      setSession(result.accessToken, result.refreshToken, result.user);
    },
    [setSession]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authApi.login({ email, password });
      await invoke("save_session", { refreshToken: result.refreshToken });
      setSession(result.accessToken, result.refreshToken, result.user);
    },
    [setSession]
  );

  return {
    isAuthenticated: !!accessToken,
    user,
    sessionExpired,
    activate,
    login,
    logout: logoutStore,
  };
}
