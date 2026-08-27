import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useStreamers } from "./useStreamers";
import * as streamersApi from "../services/streamersApi";

vi.mock("../services/streamersApi");

const sampleStreamer = {
  id: "s1",
  name: "DiParis7k",
  username: "diparis7k",
  logoUrl: null,
  watermark: null,
  presetId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(streamersApi.listStreamers).mockResolvedValue([sampleStreamer]);
  vi.mocked(streamersApi.createStreamer).mockResolvedValue({ ...sampleStreamer, id: "s2" });
  vi.mocked(streamersApi.updateStreamer).mockResolvedValue({ ...sampleStreamer, name: "Editado" });
  vi.mocked(streamersApi.deleteStreamer).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useStreamers", () => {
  it("loads streamers on mount", async () => {
    const { result } = renderHook(() => useStreamers());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.streamers).toEqual([sampleStreamer]);
  });

  it("create() calls the API and reloads the list", async () => {
    const { result } = renderHook(() => useStreamers());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.create({ name: "Novo", username: "novo" });
    });

    expect(streamersApi.createStreamer).toHaveBeenCalledWith({ name: "Novo", username: "novo" });
    expect(streamersApi.listStreamers).toHaveBeenCalledTimes(2);
  });

  it("remove() calls the API and reloads the list", async () => {
    const { result } = renderHook(() => useStreamers());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove("s1");
    });

    expect(streamersApi.deleteStreamer).toHaveBeenCalledWith("s1");
    expect(streamersApi.listStreamers).toHaveBeenCalledTimes(2);
  });
});
