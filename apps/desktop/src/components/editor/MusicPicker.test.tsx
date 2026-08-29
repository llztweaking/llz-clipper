import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MusicPicker } from "./MusicPicker";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
import { open } from "@tauri-apps/plugin-dialog";

beforeEach(() => {
  vi.mocked(open).mockReset();
});

describe("MusicPicker", () => {
  it("shows a button to select music when there is none", () => {
    render(<MusicPicker music={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "+ Selecionar música" })).toBeInTheDocument();
  });

  it("opens the native file picker and sets a new track", async () => {
    vi.mocked(open).mockResolvedValue("C:\\musicas\\trilha.mp3");
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MusicPicker music={null} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "+ Selecionar música" }));

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: false, filters: [{ name: "Áudio", extensions: ["mp3", "wav"] }] })
    );
    expect(onChange).toHaveBeenCalledWith({ filePath: "C:\\musicas\\trilha.mp3", volume: 0.5 });
  });

  it("shows the file name and volume slider when a track is set", () => {
    render(<MusicPicker music={{ filePath: "C:\\musicas\\trilha.mp3", volume: 0.7 }} onChange={vi.fn()} />);

    expect(screen.getByText("trilha.mp3")).toBeInTheDocument();
    expect(screen.getByRole("slider")).toHaveValue("0.7");
  });

  it("calls onChange with the updated volume when the slider changes", async () => {
    const onChange = vi.fn();
    render(<MusicPicker music={{ filePath: "C:\\musicas\\trilha.mp3", volume: 0.5 }} onChange={onChange} />);

    const slider = screen.getByRole("slider");
    Object.defineProperty(slider, "value", { value: "0.9", writable: true });
    slider.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith({ filePath: "C:\\musicas\\trilha.mp3", volume: 0.9 });
  });

  it("calls onChange with null when Remover is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MusicPicker music={{ filePath: "C:\\musicas\\trilha.mp3", volume: 0.5 }} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Remover" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
