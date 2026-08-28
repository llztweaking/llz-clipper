import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VodCard } from "./VodCard";
import * as vodsApi from "../services/vodsApi";
import type { Vod } from "../types";

vi.mock("../services/vodsApi");

const baseVod: Vod = {
  id: "v1",
  filename: "stream_2026.mp4",
  sourcePath: "C:\\videos\\stream_2026.mp4",
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
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(vodsApi.getVodThumbnail).mockResolvedValue(new Blob(["fake-jpeg-bytes"], { type: "image/jpeg" }));
  URL.createObjectURL = vi.fn(() => "blob:mock-thumbnail-url");
  URL.revokeObjectURL = vi.fn();
});

describe("VodCard", () => {
  it("shows a progress bar and currentStep while the job is in progress", () => {
    const vod: Vod = { ...baseVod, jobs: [{ status: "UPLOADING", progress: 42, currentStep: "Copiando arquivo", error: null }] };
    render(<VodCard vod={vod} onDelete={vi.fn()} onRetry={vi.fn()} />);

    expect(screen.getByText(/Copiando arquivo/)).toBeInTheDocument();
    expect(screen.getByText(/42%/)).toBeInTheDocument();
  });

  it("shows extracted metadata once the job is COMPLETED", () => {
    const vod: Vod = {
      ...baseVod,
      durationSec: 125,
      width: 1920,
      height: 1080,
      fps: 60,
      sizeBytes: "8400000000",
      jobs: [{ status: "COMPLETED", progress: 100, currentStep: null, error: null }],
    };
    render(<VodCard vod={vod} onDelete={vi.fn()} onRetry={vi.fn()} />);

    expect(screen.getByText(/02:05/)).toBeInTheDocument();
    expect(screen.getByText(/1920x1080/)).toBeInTheDocument();
    expect(screen.getByText(/60/)).toBeInTheDocument();
  });

  it("shows the error and a retry button when the job FAILED", async () => {
    const onRetry = vi.fn();
    const vod: Vod = { ...baseVod, jobs: [{ status: "FAILED", progress: 0, currentStep: null, error: "Arquivo não encontrado" }] };
    const user = userEvent.setup();
    render(<VodCard vod={vod} onDelete={vi.fn()} onRetry={onRetry} />);

    expect(screen.getByText("Arquivo não encontrado")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("requires confirmation before calling onDelete", async () => {
    const onDelete = vi.fn();
    const vod: Vod = { ...baseVod, jobs: [{ status: "COMPLETED", progress: 100, currentStep: null, error: null }] };
    const user = userEvent.setup();
    render(<VodCard vod={vod} onDelete={onDelete} onRetry={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onDelete).toHaveBeenCalled();
  });

  it("renders a thumbnail image for a COMPLETED job once the blob fetch resolves", async () => {
    const vod: Vod = {
      ...baseVod,
      jobs: [{ status: "COMPLETED", progress: 100, currentStep: null, error: null }],
    };
    render(<VodCard vod={vod} onDelete={vi.fn()} onRetry={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());

    expect(vodsApi.getVodThumbnail).toHaveBeenCalledWith("v1");
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:mock-thumbnail-url");
  });

  it("does not render a broken image and does not crash when the thumbnail fetch 404s", async () => {
    vi.mocked(vodsApi.getVodThumbnail).mockRejectedValueOnce(new Error("thumbnail_not_found"));
    const vod: Vod = {
      ...baseVod,
      jobs: [{ status: "COMPLETED", progress: 100, currentStep: null, error: null }],
    };
    render(<VodCard vod={vod} onDelete={vi.fn()} onRetry={vi.fn()} />);

    await waitFor(() => expect(vodsApi.getVodThumbnail).toHaveBeenCalledWith("v1"));

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
