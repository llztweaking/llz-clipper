import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "./SettingsPage";
import { authedRequest } from "../services/authedRequest";

vi.mock("../services/authedRequest", () => ({ authedRequest: vi.fn() }));

const logoutMock = vi.fn();
vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ logout: logoutMock }),
}));

beforeEach(() => {
  logoutMock.mockReset();
  vi.mocked(authedRequest).mockResolvedValue({
    user: { id: "1", email: "user@example.com", role: "USER" },
    license: {
      plan: "MONTHLY",
      status: "ACTIVE",
      activatedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-31T00:00:00.000Z",
      hwid: "hwid-abc",
    },
  });
});

describe("SettingsPage", () => {
  it("shows the account email, plan, and license status", async () => {
    render(<SettingsPage />);
    expect(await screen.findByText(/user@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/MONTHLY/)).toBeInTheDocument();
    expect(screen.getByText(/ACTIVE/)).toBeInTheDocument();
  });

  it("calls logout when the Sair button is clicked", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText(/user@example\.com/);

    await user.click(screen.getByRole("button", { name: "Sair" }));

    expect(logoutMock).toHaveBeenCalled();
  });

  it("shows a placeholder for the other tabs", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText(/user@example\.com/);

    await user.click(screen.getByRole("button", { name: "Geral" }));

    expect(screen.getByText("Em breve.")).toBeInTheDocument();
  });
});
