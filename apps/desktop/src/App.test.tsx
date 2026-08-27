import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { useAuthStore } from "./stores/authStore";

vi.mock("./services/authApi", () => ({
  restoreSession: vi.fn().mockResolvedValue(null),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

import { restoreSession } from "./services/authApi";

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, sessionExpired: false });
  window.location.hash = "";
  vi.mocked(restoreSession).mockResolvedValue(null);
});

describe("App", () => {
  it("shows the login page when there is no restored session", async () => {
    render(<App />);
    expect(await screen.findByPlaceholderText("Email")).toBeInTheDocument();
  });

  it("shows the sidebar once a session is restored", async () => {
    vi.mocked(restoreSession).mockResolvedValue({
      accessToken: "at",
      refreshToken: "rt",
      user: { id: "1", email: "a@a.com", role: "USER" },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("STREAMERS")).toBeInTheDocument();
    });
  });

  it("redirects a non-admin away from /admin to /streamers", async () => {
    vi.mocked(restoreSession).mockResolvedValue({
      accessToken: "at",
      refreshToken: "rt",
      user: { id: "1", email: "a@a.com", role: "USER" },
    });
    window.location.hash = "#/admin";

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Streamers")).toBeInTheDocument();
    });
  });

  it("shows the SessionExpiredModal when the store flags an expired session", async () => {
    vi.mocked(restoreSession).mockResolvedValue({
      accessToken: "at",
      refreshToken: "rt",
      user: { id: "1", email: "a@a.com", role: "USER" },
    });

    render(<App />);
    await waitFor(() => expect(screen.getByText("STREAMERS")).toBeInTheDocument());

    useAuthStore.getState().sessionExpiredNow();

    expect(await screen.findByText("Sua sessão expirou")).toBeInTheDocument();
  });
});
