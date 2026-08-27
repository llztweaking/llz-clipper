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
  vi.mocked(adminApi.listKeys).mockReset().mockResolvedValue({ items: [sampleKey], total: 1, page: 1, pageSize: 20 });
  vi.mocked(adminApi.createKey).mockReset().mockResolvedValue(sampleKey);
  vi.mocked(adminApi.createKeysBulk).mockReset().mockResolvedValue([sampleKey, sampleKey]);
  vi.mocked(adminApi.revokeKey).mockReset().mockResolvedValue({ ...sampleKey, status: "REVOKED" });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

  it("disables the generate buttons while a generate call is in flight and re-enables them after", async () => {
    const gate = deferred<typeof sampleKey>();
    vi.mocked(adminApi.createKey).mockReturnValueOnce(gate.promise);
    const user = userEvent.setup();
    render(<AdminPage />);
    await screen.findByText("LLZ-AAAA-BBBB-CCCC");

    await user.click(screen.getByRole("button", { name: "Gerar Key (Mensal)" }));

    expect(screen.getByRole("button", { name: "Gerar Key (Mensal)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gerar 50 Keys" })).toBeDisabled();

    gate.resolve(sampleKey);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Gerar Key (Mensal)" })).not.toBeDisabled();
    });
  });

  it("re-enables the generate buttons after a failed generate call instead of hanging", async () => {
    vi.mocked(adminApi.createKeysBulk).mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<AdminPage />);
    await screen.findByText("LLZ-AAAA-BBBB-CCCC");

    await user.click(screen.getByRole("button", { name: "Gerar 50 Keys" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Gerar 50 Keys" })).not.toBeDisabled();
    });
  });

  it("disables only the revoked key's button while revoking and re-enables on failure", async () => {
    vi.mocked(adminApi.listKeys).mockResolvedValue({
      items: [sampleKey, { ...sampleKey, id: "k2", code: "LLZ-DDDD-EEEE-FFFF" }],
      total: 2,
      page: 1,
      pageSize: 20,
    });
    vi.mocked(adminApi.revokeKey).mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<AdminPage />);
    await screen.findByText("LLZ-AAAA-BBBB-CCCC");

    const revokeButtons = screen.getAllByRole("button", { name: "Revogar" });
    await user.click(revokeButtons[0]);

    await waitFor(() => {
      expect(adminApi.revokeKey).toHaveBeenCalledWith("k1");
    });
    // The button re-enables (as "Revogar") after the failed call instead of
    // being stuck on "Revogando…" forever.
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Revogar" })).toHaveLength(2);
    });
  });

  it("paginates: Anterior is disabled on page 1, Próxima requests the next page", async () => {
    vi.mocked(adminApi.listKeys).mockResolvedValue({ items: [sampleKey], total: 25, page: 1, pageSize: 20 });
    const user = userEvent.setup();
    render(<AdminPage />);
    await screen.findByText("LLZ-AAAA-BBBB-CCCC");

    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Próxima" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Próxima" }));

    await waitFor(() => {
      expect(adminApi.listKeys).toHaveBeenLastCalledWith({ status: undefined, page: 2 });
    });
  });

  it("disables Próxima once the last page is reached", async () => {
    vi.mocked(adminApi.listKeys).mockResolvedValue({ items: [sampleKey], total: 1, page: 1, pageSize: 20 });
    render(<AdminPage />);
    await screen.findByText("LLZ-AAAA-BBBB-CCCC");

    expect(screen.getByRole("button", { name: "Próxima" })).toBeDisabled();
  });

  it("resets to page 1 when the status filter changes", async () => {
    vi.mocked(adminApi.listKeys).mockResolvedValue({ items: [sampleKey], total: 25, page: 1, pageSize: 20 });
    const user = userEvent.setup();
    render(<AdminPage />);
    await screen.findByText("LLZ-AAAA-BBBB-CCCC");

    await user.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => {
      expect(adminApi.listKeys).toHaveBeenLastCalledWith({ status: undefined, page: 2 });
    });

    await user.selectOptions(screen.getByRole("combobox"), "ACTIVE");

    await waitFor(() => {
      expect(adminApi.listKeys).toHaveBeenLastCalledWith({ status: "ACTIVE", page: 1 });
    });
  });
});
