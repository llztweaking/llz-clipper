import { describe, it, expect, vi, beforeEach } from "vitest";
import { rawRequest, ApiError } from "./apiClient";
import { useNetworkStore } from "../stores/networkStore";

beforeEach(() => {
  useNetworkStore.setState({ offline: false });
  vi.restoreAllMocks();
});

describe("rawRequest", () => {
  it("returns parsed JSON on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ hello: "world" }),
      })
    );

    const result = await rawRequest<{ hello: string }>("/ping");
    expect(result).toEqual({ hello: "world" });
    expect(useNetworkStore.getState().offline).toBe(false);
  });

  it("throws ApiError with the server's error code and message on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "key_not_found", message: "Key inválida" }),
      })
    );

    await expect(rawRequest("/auth/activate-key")).rejects.toMatchObject({
      status: 404,
      code: "key_not_found",
      message: "Key inválida",
    });
  });

  it("marks the network store offline and throws network_error when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(rawRequest("/health")).rejects.toMatchObject({ code: "network_error" });
    expect(useNetworkStore.getState().offline).toBe(true);
  });

  it("sends the Authorization header when a token is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await rawRequest("/streamers", { token: "abc123" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/streamers"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer abc123" }) })
    );
  });

  it("does not attempt to parse a body on a 204 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));
    const result = await rawRequest("/auth/logout", { method: "POST" });
    expect(result).toEqual({});
  });
});
