import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WatermarkPicker } from "./WatermarkPicker";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
import { open } from "@tauri-apps/plugin-dialog";

beforeEach(() => {
  vi.mocked(open).mockReset();
});

describe("WatermarkPicker", () => {
  it("shows a button to select a watermark when there is none", () => {
    render(<WatermarkPicker watermark={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "+ Selecionar marca d'água" })).toBeInTheDocument();
  });

  it("opens the native file picker and sets a new watermark with a default position", async () => {
    vi.mocked(open).mockResolvedValue("C:\\imgs\\logo.png");
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WatermarkPicker watermark={null} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "+ Selecionar marca d'água" }));

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: false, filters: [{ name: "Imagem", extensions: ["png", "jpg", "jpeg"] }] })
    );
    expect(onChange).toHaveBeenCalledWith({ filePath: "C:\\imgs\\logo.png", position: "bottom-right" });
  });

  it("shows the file name and a position selector when a watermark is set", () => {
    render(<WatermarkPicker watermark={{ filePath: "C:\\imgs\\logo.png", position: "top-left" }} onChange={vi.fn()} />);

    expect(screen.getByText("logo.png")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("top-left");
  });

  it("calls onChange with the updated position when the selector changes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WatermarkPicker watermark={{ filePath: "C:\\imgs\\logo.png", position: "top-left" }} onChange={onChange} />);

    await user.selectOptions(screen.getByRole("combobox"), "bottom-right");

    expect(onChange).toHaveBeenCalledWith({ filePath: "C:\\imgs\\logo.png", position: "bottom-right" });
  });

  it("calls onChange with null when Remover is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WatermarkPicker watermark={{ filePath: "C:\\imgs\\logo.png", position: "top-left" }} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Remover" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
