import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthStore } from "./authStore";

const invokeMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("../services/authApi", () => ({
  logoutRequest: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, sessionExpired: false });
  invokeMock.mockClear();
});

describe("authStore", () => {
  it("setSession stores the tokens and user, clearing any expired flag", () => {
    useAuthStore.setState({ sessionExpired: true });
    useAuthStore.getState().setSession("at", "rt", { id: "1", email: "a@a.com", role: "USER" });

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe("at");
    expect(state.refreshToken).toBe("rt");
    expect(state.user?.email).toBe("a@a.com");
    expect(state.sessionExpired).toBe(false);
  });

  it("setAccessToken updates only the access token", () => {
    useAuthStore.getState().setSession("at", "rt", { id: "1", email: "a@a.com", role: "USER" });
    useAuthStore.getState().setAccessToken("new-at");

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe("new-at");
    expect(state.refreshToken).toBe("rt");
  });

  it("sessionExpiredNow clears tokens/user, sets the flag, and clears the stored session", () => {
    useAuthStore.getState().setSession("at", "rt", { id: "1", email: "a@a.com", role: "USER" });
    useAuthStore.getState().sessionExpiredNow();

    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.sessionExpired).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("clear_session");
  });

  it("clearSessionExpired only clears the flag", () => {
    useAuthStore.setState({ sessionExpired: true });
    useAuthStore.getState().clearSessionExpired();
    expect(useAuthStore.getState().sessionExpired).toBe(false);
  });

  it("logout clears local state and the stored session", async () => {
    useAuthStore.getState().setSession("at", "rt", { id: "1", email: "a@a.com", role: "USER" });
    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("clear_session");
  });
});
