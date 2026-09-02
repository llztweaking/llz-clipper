import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LoginBackground } from "./LoginBackground";

describe("LoginBackground", () => {
  it("renders the expected number of particles", () => {
    const { container } = render(<LoginBackground />);
    expect(container.querySelectorAll(".login-particle")).toHaveLength(14);
  });

  it("is purely decorative and hidden from assistive tech", () => {
    const { container } = render(<LoginBackground />);
    expect(container.querySelector(".login-background")).toHaveAttribute("aria-hidden", "true");
  });
});
