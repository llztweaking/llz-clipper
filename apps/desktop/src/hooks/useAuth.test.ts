import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "./useAuth";
import { useAuthStore } from "../stores/authStore";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

vi.mock("../services/authApi", async () => {
  const actual = await vi.importActual<typeof import("../services/authApi")>("../services/authApi");
  return {
    ...actual,
    activateKey: vi.fn(),
    login: vi.fn(),
  };
});

import * as authApi from "../services/authApi";

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, sessionExpired: false });
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
});

describe("useAuth", () => {
  it("activate() gets the hwid, calls activateKey, saves the session, and updates the store", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_hwid") return Promise.resolve("hwid-123");
      return Promise.resolve(undefined);
    });
    vi.mocked(authApi.activateKey).mockResolvedValue({
      accessToken: "at",
      refreshToken: "rt",
      user: { id: "1", email: "a@a.com", role: "USER" },
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.activate("LLZ-AAAA-BBBB-CCCC", "a@a.com", "pw123456");
    });

    expect(authApi.activateKey).toHaveBeenCalledWith({
      code: "LLZ-AAAA-BBBB-CCCC",
      email: "a@a.com",
      password: "pw123456",
      hwid: "hwid-123",
    });
    expect(invokeMock).toHaveBeenCalledWith("save_session", { refreshToken: "rt" });
    expect(useAuthStore.getState().accessToken).toBe("at");
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("login() gets the hwid, calls login, saves the session, and updates the store", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_hwid") return Promise.resolve("hwid-456");
      return Promise.resolve(undefined);
    });
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: "at2",
      refreshToken: "rt2",
      user: { id: "1", email: "a@a.com", role: "USER" },
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login("a@a.com", "pw123456");
    });

    expect(authApi.login).toHaveBeenCalledWith({ email: "a@a.com", password: "pw123456", hwid: "hwid-456" });
    expect(invokeMock).toHaveBeenCalledWith("save_session", { refreshToken: "rt2" });
    expect(useAuthStore.getState().accessToken).toBe("at2");
  });

  it("isAuthenticated reflects whether an access token is present", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);
  });
});
