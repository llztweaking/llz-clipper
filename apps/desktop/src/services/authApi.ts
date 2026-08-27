import { invoke } from "@tauri-apps/api/core";
import { rawRequest } from "./apiClient";
import type { ActivateKeyInput, LoginInput, AuthResult, AuthUser, LicenseSummary } from "../types";

export function activateKey(input: ActivateKeyInput): Promise<AuthResult> {
  return rawRequest("/auth/activate-key", { method: "POST", body: input });
}

export function login(input: LoginInput): Promise<AuthResult> {
  return rawRequest("/auth/login", { method: "POST", body: input });
}

export function refresh(refreshToken: string): Promise<{ accessToken: string }> {
  return rawRequest("/auth/refresh", { method: "POST", body: { refreshToken } });
}

export function logoutRequest(refreshToken: string): Promise<void> {
  return rawRequest("/auth/logout", { method: "POST", body: { refreshToken } });
}

export function me(accessToken: string): Promise<{ user: AuthUser; license: LicenseSummary | null }> {
  return rawRequest("/auth/me", { token: accessToken });
}

export async function restoreSession(): Promise<AuthResult | null> {
  const storedRefreshToken = await invoke<string | null>("load_session");
  if (!storedRefreshToken) return null;

  try {
    const { accessToken } = await refresh(storedRefreshToken);
    const { user } = await me(accessToken);
    return { accessToken, refreshToken: storedRefreshToken, user };
  } catch {
    await invoke("clear_session");
    return null;
  }
}
