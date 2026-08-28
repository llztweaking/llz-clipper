import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VodPage } from "./VodPage";
import * as vodsApi from "../services/vodsApi";
import * as streamersApi from "../services/streamersApi";

vi.mock("../services/vodsApi");
vi.mock("../services/streamersApi");
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { open } from "@tauri-apps/plugin-dialog";

const sampleStreamer = { id: "s1", name: "DiParis7k", username: "diparis7k", logoUrl: null, watermark: null, presetId: null, createdAt: "2026-01-01T00:00:00.000Z" };

const sampleVod = {
  id: "v1",
  filename: "stream.mp4",
  sourcePath: "C:\\videos\\stream.mp4",
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
  vi.mocked(streamersApi.listStreamers).mockResolvedValue([sampleStreamer]);
  vi.mocked(vodsApi.listVods).mockResolvedValue([sampleVod]);
  vi.mocked(vodsApi.createVod).mockResolvedValue({ vod: { ...sampleVod, id: "v2" }, jobId: "j2" });
  vi.mocked(open).mockReset();
});

describe("VodPage", () => {
  it("lists existing VODs", async () => {
    render(<VodPage />);
    expect(await screen.findByText("stream.mp4")).toBeInTheDocument();
  });

  it("opens the native file picker and fills in the selected path when clicking Selecionar VOD", async () => {
    vi.mocked(open).mockResolvedValue("C:\\videos\\novo.mp4");
    const user = userEvent.setup();
    render(<VodPage />);
    await screen.findByText("stream.mp4");

    await user.click(screen.getByRole("button", { name: "+ Selecionar VOD" }));

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: false, filters: [{ name: "VOD", extensions: ["mp4", "mkv", "mov", "webm"] }] })
    );
    expect(await screen.findByText("C:\\videos\\novo.mp4")).toBeInTheDocument();
  });

  it("creates a VOD with the selected file and streamer", async () => {
    vi.mocked(open).mockResolvedValue("C:\\videos\\novo.mp4");
    const user = userEvent.setup();
    render(<VodPage />);
    await screen.findByText("stream.mp4");

    await user.click(screen.getByRole("button", { name: "+ Selecionar VOD" }));
    await screen.findByText("C:\\videos\\novo.mp4");
    await user.selectOptions(screen.getByRole("combobox"), "s1");
    await user.click(screen.getByRole("button", { name: "Adicionar VOD" }));

    await waitFor(() => {
      expect(vodsApi.createVod).toHaveBeenCalledWith({ streamerId: "s1", sourcePath: "C:\\videos\\novo.mp4" });
    });
  });

  it("shows the server's error message when creation fails", async () => {
    const { ApiError } = await import("../services/apiClient");
    vi.mocked(vodsApi.createVod).mockRejectedValue(new ApiError(400, "invalid_extension", "Formato não suportado"));
    vi.mocked(open).mockResolvedValue("C:\\videos\\novo.txt");
    const user = userEvent.setup();
    render(<VodPage />);
    await screen.findByText("stream.mp4");

    await user.click(screen.getByRole("button", { name: "+ Selecionar VOD" }));
    await screen.findByText("C:\\videos\\novo.txt");
    await user.selectOptions(screen.getByRole("combobox"), "s1");
    await user.click(screen.getByRole("button", { name: "Adicionar VOD" }));

    expect(await screen.findByText("Formato não suportado")).toBeInTheDocument();
  });

  it("does nothing when the user cancels the file picker", async () => {
    vi.mocked(open).mockResolvedValue(null);
    const user = userEvent.setup();
    render(<VodPage />);
    await screen.findByText("stream.mp4");

    await user.click(screen.getByRole("button", { name: "+ Selecionar VOD" }));

    expect(screen.queryByText(/C:\\/)).not.toBeInTheDocument();
  });
});
