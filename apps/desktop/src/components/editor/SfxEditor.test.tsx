import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SfxEditor } from "./SfxEditor";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
import { open } from "@tauri-apps/plugin-dialog";

beforeEach(() => {
  vi.mocked(open).mockReset();
});

describe("SfxEditor", () => {
  it("renders one row per sfx cue, showing the file name", () => {
    render(<SfxEditor sfx={[{ time: 0, filePath: "C:\\sons\\boom.wav" }]} onChange={vi.fn()} />);

    expect(screen.getByText("boom.wav")).toBeInTheDocument();
  });

  it("opens the native file picker and adds a new cue when + Efeito sonoro is clicked", async () => {
    vi.mocked(open).mockResolvedValue("C:\\sons\\novo.mp3");
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SfxEditor sfx={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "+ Efeito sonoro" }));

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: false, filters: [{ name: "Áudio", extensions: ["mp3", "wav"] }] })
    );
    expect(onChange).toHaveBeenCalledWith([{ time: 0, filePath: "C:\\sons\\novo.mp3" }]);
  });

  it("does nothing when the user cancels the file picker", async () => {
    vi.mocked(open).mockResolvedValue(null);
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SfxEditor sfx={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "+ Efeito sonoro" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("calls onChange with the cue removed when Remover is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SfxEditor sfx={[{ time: 0, filePath: "C:\\sons\\boom.wav" }]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Remover" }));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
