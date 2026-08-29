import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaptionEditor } from "./CaptionEditor";

describe("CaptionEditor", () => {
  it("renders one row per caption", () => {
    const captions = [
      { start: 0, end: 2, text: "Primeira" },
      { start: 2, end: 4, text: "Segunda" },
    ];
    render(<CaptionEditor captions={captions} onChange={vi.fn()} />);

    expect(screen.getByDisplayValue("Primeira")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Segunda")).toBeInTheDocument();
  });

  it("calls onChange with an updated text when a row's text changes", async () => {
    const onChange = vi.fn();
    render(<CaptionEditor captions={[{ start: 0, end: 2, text: "Primeira" }]} onChange={onChange} />);

    const textInput = screen.getByDisplayValue("Primeira");
    fireEvent.change(textInput, { target: { value: "Editada" } });

    expect(onChange).toHaveBeenLastCalledWith([{ start: 0, end: 2, text: "Editada" }]);
  });

  it("calls onChange with the row removed when Remover is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const captions = [
      { start: 0, end: 2, text: "Primeira" },
      { start: 2, end: 4, text: "Segunda" },
    ];
    render(<CaptionEditor captions={captions} onChange={onChange} />);

    await user.click(screen.getAllByRole("button", { name: "Remover" })[0]);

    expect(onChange).toHaveBeenCalledWith([{ start: 2, end: 4, text: "Segunda" }]);
  });

  it("calls onChange with a new blank caption appended when + Legenda is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CaptionEditor captions={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "+ Legenda" }));

    expect(onChange).toHaveBeenCalledWith([{ start: 0, end: 1, text: "" }]);
  });
});
