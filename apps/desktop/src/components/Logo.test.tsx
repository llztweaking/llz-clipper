import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Logo } from "./Logo";

describe("Logo", () => {
  it("renders the wordmark text", () => {
    render(<Logo />);
    expect(screen.getByText("LLZ")).toBeInTheDocument();
    expect(screen.getByText("CLIPPER")).toBeInTheDocument();
  });

  it("renders a larger icon for size='lg' than the default size='sm'", () => {
    const { container: smContainer } = render(<Logo />);
    const { container: lgContainer } = render(<Logo size="lg" />);

    const smSvg = smContainer.querySelector("svg");
    const lgSvg = lgContainer.querySelector("svg");

    expect(smSvg).not.toBeNull();
    expect(lgSvg).not.toBeNull();
    expect(Number(lgSvg!.getAttribute("width"))).toBeGreaterThan(Number(smSvg!.getAttribute("width")));
  });
});
