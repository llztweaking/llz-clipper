import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ClipsPage } from "./ClipsPage";
import * as vodsApi from "../services/vodsApi";
import * as clipsApi from "../services/clipsApi";

vi.mock("../services/vodsApi");
vi.mock("../services/clipsApi");

const completedVod = {
  id: "v1",
  filename: "stream.mp4",
  sourcePath: "C:\\videos\\stream.mp4",
  storagePath: "storage/vods/v1.mp4",
  durationSec: 300,
  width: 1920,
  height: 1080,
  fps: 60,
  sizeBytes: "1000000",
  codec: "h264",
  streamerId: "s1",
  presetId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  jobs: [{ status: "COMPLETED" as const, progress: 100, currentStep: null, error: null }],
};

const queuedVod = {
  ...completedVod,
  id: "v2",
  filename: "not-done-yet.mp4",
  jobs: [{ status: "UPLOADING" as const, progress: 40, currentStep: "Copiando arquivo", error: null }],
};

const sampleClip = {
  id: "c1",
  vodId: "v1",
  startTime: 10,
  endTime: 40,
  title: "Que jogada incrível",
  category: "PLAY" as const,
  score: 80,
  scoreReason: "palavra-chave",
  status: "DETECTED" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function renderClipsPage() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<ClipsPage />} />
        <Route path="/editor/:clipId" element={<p>Tela do editor</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(vodsApi.listVods).mockResolvedValue([completedVod, queuedVod]);
  vi.mocked(clipsApi.listClips).mockResolvedValue([sampleClip]);
  vi.mocked(clipsApi.updateClipStatus).mockResolvedValue({ ...sampleClip, status: "APPROVED" });
});

describe("ClipsPage", () => {
  it("lists only COMPLETED VODs in the selector", async () => {
    renderClipsPage();

    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());
    expect(screen.queryByText("not-done-yet.mp4")).not.toBeInTheDocument();
  });

  it("shows a placeholder message before a VOD is selected", async () => {
    renderClipsPage();
    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());

    expect(screen.getByText("Selecione um VOD para ver os clipes detectados.")).toBeInTheDocument();
  });

  it("loads and shows clips once a VOD is selected", async () => {
    const user = userEvent.setup();
    renderClipsPage();
    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());

    await user.selectOptions(screen.getByRole("combobox"), "v1");

    await waitFor(() => expect(screen.getByText("Que jogada incrível")).toBeInTheDocument());
    expect(clipsApi.listClips).toHaveBeenCalledWith("v1");
  });

  it("shows a message when the selected VOD has no detected clips", async () => {
    vi.mocked(clipsApi.listClips).mockResolvedValue([]);
    const user = userEvent.setup();
    renderClipsPage();
    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());

    await user.selectOptions(screen.getByRole("combobox"), "v1");

    await waitFor(() => expect(screen.getByText("Nenhum clipe detectado para este VOD.")).toBeInTheDocument());
  });

  it("approves a clip from the list", async () => {
    const user = userEvent.setup();
    renderClipsPage();
    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());
    await user.selectOptions(screen.getByRole("combobox"), "v1");
    await waitFor(() => expect(screen.getByText("Que jogada incrível")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Aprovar" }));

    expect(clipsApi.updateClipStatus).toHaveBeenCalledWith("c1", "APPROVED");
  });

  it("navigates to /editor/:clipId when Editar is clicked on an approved clip", async () => {
    vi.mocked(clipsApi.listClips).mockResolvedValue([{ ...sampleClip, status: "APPROVED" }]);
    const user = userEvent.setup();
    renderClipsPage();
    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());
    await user.selectOptions(screen.getByRole("combobox"), "v1");
    await waitFor(() => expect(screen.getByText("Que jogada incrível")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(await screen.findByText("Tela do editor")).toBeInTheDocument();
  });
});
