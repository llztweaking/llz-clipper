import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrimControls } from "./TrimControls";

describe("TrimControls", () => {
  it("shows the current start and end values", () => {
    render(<TrimControls start={5} end={25} maxDuration={100} onChange={vi.fn()} />);

    expect(screen.getByLabelText("Início (s)")).toHaveValue(5);
    expect(screen.getByLabelText("Fim (s)")).toHaveValue(25);
  });

  it("calls onChange with the new start when the start field changes", async () => {
    const onChange = vi.fn();
    render(<TrimControls start={5} end={25} maxDuration={100} onChange={onChange} />);

    const startInput = screen.getByLabelText("Início (s)") as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: "8" } });

    expect(onChange).toHaveBeenLastCalledWith(8, 25);
  });

  it("calls onChange with the new end when the end field changes", async () => {
    const onChange = vi.fn();
    render(<TrimControls start={5} end={25} maxDuration={100} onChange={onChange} />);

    const endInput = screen.getByLabelText("Fim (s)") as HTMLInputElement;
    fireEvent.change(endInput, { target: { value: "30" } });

    expect(onChange).toHaveBeenLastCalledWith(5, 30);
  });
});
