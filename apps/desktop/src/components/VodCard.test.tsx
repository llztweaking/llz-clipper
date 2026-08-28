import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VodCard } from "./VodCard";
import type { Vod } from "../types";

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
});
