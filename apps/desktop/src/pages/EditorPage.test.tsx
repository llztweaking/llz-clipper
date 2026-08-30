import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EditorPage } from "./EditorPage";
import * as clipsApi from "../services/clipsApi";
import * as editPlansApi from "../services/editPlansApi";
import * as vodsApi from "../services/vodsApi";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

vi.mock("../services/clipsApi");
vi.mock("../services/editPlansApi");
vi.mock("../services/vodsApi");
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));

const sampleEditPlan = {
  id: "ep1",
  clipId: "c1",
  title: "Clipe de teste",
  segments: [{ start: 10, end: 30 }],
  captions: [{ start: 0, end: 2, text: "Olha isso" }],
  zooms: null,
  sfx: null,
  music: null,
  watermark: null,
  format: "9:16",
  resolution: "1080x1920",
  fps: 60,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const sampleClip = {
  id: "c1",
  vodId: "v1",
  startTime: 10,
  endTime: 30,
  title: "Clipe de teste",
  category: "PLAY" as const,
  score: 80,
  scoreReason: "palavra-chave",
  status: "APPROVED" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  editPlan: sampleEditPlan,
  latestRender: null,
};

const sampleVod = {
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
};

function renderEditorPage() {
  return render(
    <MemoryRouter initialEntries={["/editor/c1"]}>
      <Routes>
        <Route path="/editor/:clipId" element={<EditorPage />} />
        <Route path="/clips" element={<p>Tela de clipes</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clipsApi.getClip).mockResolvedValue(sampleClip);
  vi.mocked(vodsApi.getVod).mockResolvedValue(sampleVod);
  vi.mocked(vodsApi.getVodVideo).mockResolvedValue(new Blob(["fake video"]));
  vi.mocked(editPlansApi.updateEditPlan).mockResolvedValue(sampleEditPlan);
  global.URL.createObjectURL = vi.fn(() => "blob:fake-url");
  global.URL.revokeObjectURL = vi.fn();
});

describe("EditorPage", () => {
  it("loads the clip and shows its title and trim values", async () => {
    renderEditorPage();

    expect(await screen.findByDisplayValue("Clipe de teste")).toBeInTheDocument();
    expect(screen.getByLabelText("Início (s)")).toHaveValue(10);
    expect(screen.getByLabelText("Fim (s)")).toHaveValue(30);
  });

  it("saves the edited plan when Salvar alterações is clicked", async () => {
    const user = userEvent.setup();
    renderEditorPage();
    await screen.findByDisplayValue("Clipe de teste");

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(editPlansApi.updateEditPlan).toHaveBeenCalledWith("c1", {
        title: "Clipe de teste",
        segments: [{ start: 10, end: 30 }],
        captions: [{ start: 0, end: 2, text: "Olha isso" }],
        zooms: null,
        sfx: null,
        music: null,
        watermark: null,
      })
    );
  });

  it("navigates back to /clips when Voltar is clicked", async () => {
    const user = userEvent.setup();
    renderEditorPage();
    await screen.findByDisplayValue("Clipe de teste");

    await user.click(screen.getByRole("button", { name: "Voltar" }));

    expect(await screen.findByText("Tela de clipes")).toBeInTheDocument();
  });

  it("shows an error message when saving fails", async () => {
    vi.mocked(editPlansApi.updateEditPlan).mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    renderEditorPage();
    await screen.findByDisplayValue("Clipe de teste");

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Não foi possível salvar as alterações.")).toBeInTheDocument();
  });

  it("shows a not-found message when the clip has no editPlan", async () => {
    vi.mocked(clipsApi.getClip).mockResolvedValue({ ...sampleClip, editPlan: undefined });
    renderEditorPage();

    expect(await screen.findByText("Clipe não encontrado.")).toBeInTheDocument();
  });

  it("shows a Renderizar button for an APPROVED clip and starts a render when clicked", async () => {
    vi.mocked(clipsApi.renderClip).mockResolvedValue({ renderId: "r1" });
    const user = userEvent.setup();
    renderEditorPage();
    await screen.findByDisplayValue("Clipe de teste");

    await user.click(screen.getByRole("button", { name: "Renderizar" }));

    expect(clipsApi.renderClip).toHaveBeenCalledWith("c1");
  });

  it("shows render progress while the latest render is RENDERING", async () => {
    vi.mocked(clipsApi.getClip).mockResolvedValue({
      ...sampleClip,
      status: "RENDERING",
      latestRender: { id: "r1", clipId: "c1", status: "RENDERING", progress: 42, outputPath: null, error: null, createdAt: "2026-01-01T00:00:00.000Z", finishedAt: null },
    });
    renderEditorPage();

    expect(await screen.findByText(/42%/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Renderizar" })).not.toBeInTheDocument();
  });

  it("shows Abrir arquivo when the latest render is COMPLETED, and opens it", async () => {
    vi.mocked(clipsApi.getClip).mockResolvedValue({
      ...sampleClip,
      status: "COMPLETED",
      latestRender: { id: "r1", clipId: "c1", status: "COMPLETED", progress: 100, outputPath: "C:\\storage\\renders\\c1-r1.mp4", error: null, createdAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:01:00.000Z" },
    });
    const user = userEvent.setup();
    renderEditorPage();
    await screen.findByText("Renderização concluída");

    await user.click(screen.getByRole("button", { name: "Abrir arquivo" }));

    expect(revealItemInDir).toHaveBeenCalledWith("C:\\storage\\renders\\c1-r1.mp4");
  });

  it("shows the render error and still offers Renderizar again when the latest render FAILED", async () => {
    vi.mocked(clipsApi.getClip).mockResolvedValue({
      ...sampleClip,
      latestRender: { id: "r1", clipId: "c1", status: "FAILED", progress: 0, outputPath: null, error: "ffmpeg explodiu", createdAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:01:00.000Z" },
    });
    renderEditorPage();

    expect(await screen.findByText("ffmpeg explodiu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Renderizar" })).toBeInTheDocument();
  });
});
