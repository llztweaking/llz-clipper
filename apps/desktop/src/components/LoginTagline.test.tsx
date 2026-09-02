import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { LoginTagline, TAGLINES } from "./LoginTagline";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LoginTagline", () => {
  it("shows the first tagline on mount", () => {
    render(<LoginTagline />);
    expect(screen.getByText(TAGLINES[0])).toBeInTheDocument();
  });

  it("rotates to the next tagline after the interval elapses", () => {
    render(<LoginTagline />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText(TAGLINES[1])).toBeInTheDocument();
    expect(screen.queryByText(TAGLINES[0])).not.toBeInTheDocument();
  });

  it("wraps back to the first tagline after cycling through all of them", () => {
    render(<LoginTagline />);

    act(() => {
      vi.advanceTimersByTime(3000 * TAGLINES.length);
    });

    expect(screen.getByText(TAGLINES[0])).toBeInTheDocument();
  });
});
