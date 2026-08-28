import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useVods } from "./useVods";
import * as vodsApi from "../services/vodsApi";

vi.mock("../services/vodsApi");

const sampleVod = {
  id: "v1",
  filename: "video.mp4",
  sourcePath: "C:\\videos\\video.mp4",
  storagePath: null,
  durationSec: null,
  width: null,
  height: null,
  fps: null,
  sizeBytes: null,
  codec: null,
  streamerId: "s1",
  presetId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  jobs: [{ status: "QUEUED" as const, progress: 0, currentStep: null, error: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(vodsApi.listVods).mockResolvedValue([sampleVod]);
  vi.mocked(vodsApi.createVod).mockResolvedValue({ vod: { ...sampleVod, id: "v2" }, jobId: "j2" });
  vi.mocked(vodsApi.deleteVod).mockResolvedValue(undefined);
  vi.mocked(vodsApi.retryVod).mockResolvedValue({ jobId: "j3" });
});

describe("useVods", () => {
  it("loads VODs on mount", async () => {
    const { result } = renderHook(() => useVods());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.vods).toEqual([sampleVod]);
  });

  it("stops loading even if listVods rejects", async () => {
    vi.mocked(vodsApi.listVods).mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() => useVods());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.vods).toEqual([]);
  });

  it("create() calls the API and reloads the list", async () => {
    const { result } = renderHook(() => useVods());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.create({ streamerId: "s1", sourcePath: "C:\\videos\\new.mp4" });
    });

    expect(vodsApi.createVod).toHaveBeenCalledWith({ streamerId: "s1", sourcePath: "C:\\videos\\new.mp4" });
    expect(vodsApi.listVods).toHaveBeenCalledTimes(2);
  });

  it("remove() calls the API and reloads the list", async () => {
    const { result } = renderHook(() => useVods());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove("v1");
    });

    expect(vodsApi.deleteVod).toHaveBeenCalledWith("v1");
    expect(vodsApi.listVods).toHaveBeenCalledTimes(2);
  });

  it("retry() calls the API and reloads the list", async () => {
    const { result } = renderHook(() => useVods());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.retry("v1");
    });

    expect(vodsApi.retryVod).toHaveBeenCalledWith("v1");
    expect(vodsApi.listVods).toHaveBeenCalledTimes(2);
  });

  it("polls again automatically while a VOD has a non-terminal job, using fake timers", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { result } = renderHook(() => useVods());
      await vi.waitFor(() => expect(result.current.loading).toBe(false));

      expect(vodsApi.listVods).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(2100);
      });

      expect(vi.mocked(vodsApi.listVods).mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not keep polling once every VOD's latest job is terminal", async () => {
    vi.mocked(vodsApi.listVods).mockResolvedValue([
      { ...sampleVod, jobs: [{ status: "COMPLETED", progress: 100, currentStep: null, error: null }] },
    ]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { result } = renderHook(() => useVods());
      await vi.waitFor(() => expect(result.current.loading).toBe(false));

      const callsAfterLoad = vi.mocked(vodsApi.listVods).mock.calls.length;

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(vi.mocked(vodsApi.listVods).mock.calls.length).toBe(callsAfterLoad);
    } finally {
      vi.useRealTimers();
    }
  });
});
