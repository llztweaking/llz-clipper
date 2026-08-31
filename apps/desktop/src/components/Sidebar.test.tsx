import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useAuthStore } from "../stores/authStore";

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, sessionExpired: false });
});

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>
  );
}

describe("Sidebar", () => {
  it("shows the core navigation items", () => {
    renderSidebar();
    expect(screen.getByText("STREAMERS")).toBeInTheDocument();
    expect(screen.getByText("CONFIGURAÇÕES")).toBeInTheDocument();
    expect(screen.getByText("VOD")).toBeInTheDocument();
  });

  it("hides the ADMIN link for a regular user", () => {
    useAuthStore.setState({ user: { id: "1", email: "a@a.com", role: "USER" } });
    renderSidebar();
    expect(screen.queryByText("ADMIN")).not.toBeInTheDocument();
  });

  it("shows the ADMIN link for an admin user", () => {
    useAuthStore.setState({ user: { id: "1", email: "a@a.com", role: "ADMIN" } });
    renderSidebar();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
  });

  it("renders an icon (not emoji) for each nav item", () => {
    renderSidebar();
    expect(screen.getByLabelText("VOD")).toBeInTheDocument();
    expect(screen.getByLabelText("CLIPS")).toBeInTheDocument();
    expect(screen.getByLabelText("EDITOR")).toBeInTheDocument();
    expect(screen.getByLabelText("STREAMERS")).toBeInTheDocument();
    expect(screen.getByLabelText("CONFIGURAÇÕES")).toBeInTheDocument();
  });
});
