import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminPage } from "./AdminPage";
import * as adminApi from "../services/adminApi";

vi.mock("../services/adminApi");

const sampleKey = {
  id: "k1",
  code: "LLZ-AAAA-BBBB-CCCC",
  plan: "MONTHLY" as const,
  status: "UNUSED" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  activatedAt: null,
  expiresAt: null,
  revokedAt: null,
  userId: null,
};

beforeEach(() => {
  vi.mocked(adminApi.listKeys).mockResolvedValue({ items: [sampleKey], total: 1, page: 1, pageSize: 20 });
  vi.mocked(adminApi.createKey).mockResolvedValue(sampleKey);
  vi.mocked(adminApi.createKeysBulk).mockResolvedValue([sampleKey, sampleKey]);
  vi.mocked(adminApi.revokeKey).mockResolvedValue({ ...sampleKey, status: "REVOKED" });
});

describe("AdminPage", () => {
  it("lists keys from the API", async () => {
    render(<AdminPage />);
    expect(await screen.findByText("LLZ-AAAA-BBBB-CCCC")).toBeInTheDocument();
  });

  it("generates a single monthly key", async () => {
    const user = userEvent.setup();
    render(<AdminPage />);
    await screen.findByText("LLZ-AAAA-BBBB-CCCC");

    await user.click(screen.getByRole("button", { name: "Gerar Key (Mensal)" }));

    await waitFor(() => {
      expect(adminApi.createKey).toHaveBeenCalledWith("MONTHLY");
    });
  });

  it("generates 10 keys in bulk", async () => {
    const user = userEvent.setup();
    render(<AdminPage />);
    await screen.findByText("LLZ-AAAA-BBBB-CCCC");

    await user.click(screen.getByRole("button", { name: "Gerar 10 Keys" }));

    await waitFor(() => {
      expect(adminApi.createKeysBulk).toHaveBeenCalledWith("MONTHLY", 10);
    });
  });

  it("revokes a key", async () => {
    const user = userEvent.setup();
    render(<AdminPage />);
    await screen.findByText("LLZ-AAAA-BBBB-CCCC");

    await user.click(screen.getByRole("button", { name: "Revogar" }));

    await waitFor(() => {
      expect(adminApi.revokeKey).toHaveBeenCalledWith("k1");
    });
  });
});
