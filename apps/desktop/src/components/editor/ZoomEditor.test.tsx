import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZoomEditor } from "./ZoomEditor";

describe("ZoomEditor", () => {
  it("renders one row per zoom point", () => {
    const zooms = [
      { time: 1, scale: 1.2 },
      { time: 5, scale: 1.5 },
    ];
    render(<ZoomEditor zooms={zooms} onChange={vi.fn()} />);

    expect(screen.getByDisplayValue("1.2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1.5")).toBeInTheDocument();
  });

  it("calls onChange with an updated scale when a row's level changes", async () => {
    const onChange = vi.fn();
    render(<ZoomEditor zooms={[{ time: 1, scale: 1.2 }]} onChange={onChange} />);

    const scaleInput = screen.getByDisplayValue("1.2");
    fireEvent.change(scaleInput, { target: { value: "1.8" } });

    expect(onChange).toHaveBeenLastCalledWith([{ time: 1, scale: 1.8 }]);
  });

  it("calls onChange with the row removed when Remover is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const zooms = [
      { time: 1, scale: 1.2 },
      { time: 5, scale: 1.5 },
    ];
    render(<ZoomEditor zooms={zooms} onChange={onChange} />);

    await user.click(screen.getAllByRole("button", { name: "Remover" })[0]);

    expect(onChange).toHaveBeenCalledWith([{ time: 5, scale: 1.5 }]);
  });

  it("calls onChange with a new zoom point appended when + Ponto de zoom is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ZoomEditor zooms={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "+ Ponto de zoom" }));

    expect(onChange).toHaveBeenCalledWith([{ time: 0, scale: 1.2 }]);
  });
});
