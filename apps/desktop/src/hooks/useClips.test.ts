import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useClips } from "./useClips";
import * as clipsApi from "../services/clipsApi";

vi.mock("../services/clipsApi");

const sampleClip = {
  id: "c1",
  vodId: "v1",
  startTime: 10,
  endTime: 30,
  title: "Clipe de teste",
  category: "PLAY" as const,
  score: 80,
  scoreReason: "palavra-chave",
  status: "DETECTED" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clipsApi.listClips).mockResolvedValue([sampleClip]);
  vi.mocked(clipsApi.updateClipStatus).mockResolvedValue({ ...sampleClip, status: "APPROVED" });
});

describe("useClips", () => {
  it("does not load anything when vodId is null", async () => {
    const { result } = renderHook(() => useClips(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.clips).toEqual([]);
    expect(clipsApi.listClips).not.toHaveBeenCalled();
  });

  it("loads clips for the given vodId", async () => {
    const { result } = renderHook(() => useClips("v1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.clips).toEqual([sampleClip]);
    expect(clipsApi.listClips).toHaveBeenCalledWith("v1");
  });

  it("reloads when vodId changes", async () => {
    const { result, rerender } = renderHook(({ vodId }) => useClips(vodId), {
      initialProps: { vodId: "v1" as string | null },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(clipsApi.listClips).mockResolvedValue([]);
    rerender({ vodId: "v2" });

    await waitFor(() => expect(clipsApi.listClips).toHaveBeenCalledWith("v2"));
  });

  it("stops loading even if listClips rejects", async () => {
    vi.mocked(clipsApi.listClips).mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() => useClips("v1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.clips).toEqual([]);
  });

  it("approve() calls the API with APPROVED and reloads", async () => {
    const { result } = renderHook(() => useClips("v1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.approve("c1");
    });

    expect(clipsApi.updateClipStatus).toHaveBeenCalledWith("c1", "APPROVED");
    expect(clipsApi.listClips).toHaveBeenCalledTimes(2);
  });

  it("reject() calls the API with REJECTED and reloads", async () => {
    const { result } = renderHook(() => useClips("v1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reject("c1");
    });

    expect(clipsApi.updateClipStatus).toHaveBeenCalledWith("c1", "REJECTED");
    expect(clipsApi.listClips).toHaveBeenCalledTimes(2);
  });
});
