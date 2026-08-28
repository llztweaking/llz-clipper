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

const meResponse = {
  user: { id: "1", email: "user@example.com", role: "USER" },
  license: {
    plan: "MONTHLY",
    status: "ACTIVE",
    activatedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-31T00:00:00.000Z",
    hwid: "hwid-abc",
  },
};

const defaultFfmpegStatus = { available: false, version: null, path: null };

beforeEach(() => {
  logoutMock.mockReset();
  vi.mocked(authedRequest).mockImplementation((path: string) => {
    if (path === "/auth/me") return Promise.resolve(meResponse);
    if (path === "/system/ffmpeg-status") return Promise.resolve(defaultFfmpegStatus);
    return Promise.reject(new Error(`unexpected path ${path}`));
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

  it("stops showing the loading state and shows a fallback when /auth/me fails", async () => {
    vi.mocked(authedRequest).mockImplementation((path: string) => {
      if (path === "/auth/me") return Promise.reject(new Error("network down"));
      if (path === "/system/ffmpeg-status") return Promise.resolve(defaultFfmpegStatus);
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
    render(<SettingsPage />);

    expect(
      await screen.findByText("Não foi possível carregar os dados da conta.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Carregando…")).not.toBeInTheDocument();
  });
});

describe("SettingsPage — Processamento tab", () => {
  it("shows FFmpeg's real status when available", async () => {
    vi.mocked(authedRequest).mockImplementation((path: string) => {
      if (path === "/auth/me") return Promise.resolve(meResponse);
      if (path === "/system/ffmpeg-status") return Promise.resolve({ available: true, version: "9.0.1", path: "ffmpeg" });
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText(/user@example\.com/);

    await user.click(screen.getByRole("button", { name: "Processamento" }));

    expect(await screen.findByText(/FFmpeg encontrado/)).toBeInTheDocument();
    expect(screen.getByText(/9\.0\.1/)).toBeInTheDocument();
  });

  it("shows a clear message when FFmpeg is unavailable", async () => {
    // The default beforeEach mock already returns { available: false, ... } for
    // /system/ffmpeg-status, so no extra mock setup is needed for this case.
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText(/user@example\.com/);

    await user.click(screen.getByRole("button", { name: "Processamento" }));

    expect(await screen.findByText(/FFmpeg não encontrado/)).toBeInTheDocument();
  });
});
