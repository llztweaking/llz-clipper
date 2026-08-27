import { describe, it, expect, vi, beforeEach } from "vitest";
import { authedRequest } from "./authedRequest";
import { useAuthStore } from "../stores/authStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));

beforeEach(() => {
  useAuthStore.setState({
    accessToken: "old-token",
    refreshToken: "refresh-token",
    user: { id: "u1", email: "a@a.com", role: "USER" },
    sessionExpired: false,
  });
  vi.restoreAllMocks();
});

describe("authedRequest", () => {
  it("attaches the current access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await authedRequest("/streamers");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer old-token" }) })
    );
  });

  it("refreshes the access token and retries once on a 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "invalid_token", message: "x" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ accessToken: "new-token" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await authedRequest("/streamers");

    expect(result).toEqual({ items: [] });
    expect(useAuthStore.getState().accessToken).toBe("new-token");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("ends the session when the refresh attempt also fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "invalid_token", message: "x" }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "invalid_refresh_token", message: "y" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(authedRequest("/streamers")).rejects.toBeTruthy();
    expect(useAuthStore.getState().sessionExpired).toBe(true);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("ends the session on a 403 license_expired without attempting a refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "license_expired", message: "Licença expirada" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(authedRequest("/streamers")).rejects.toMatchObject({ code: "license_expired" });
    expect(useAuthStore.getState().sessionExpired).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not end the session on a 403 forbidden (a role check, not a license problem)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "forbidden", message: "Acesso restrito" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(authedRequest("/admin/keys")).rejects.toMatchObject({ code: "forbidden" });
    expect(useAuthStore.getState().sessionExpired).toBe(false);
  });
});
