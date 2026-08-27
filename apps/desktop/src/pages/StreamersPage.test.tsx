import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StreamersPage } from "./StreamersPage";
import * as streamersApi from "../services/streamersApi";
import { ApiError } from "../services/apiClient";

vi.mock("../services/streamersApi");

const sampleStreamer = {
  id: "s1",
  name: "DiParis7k",
  username: "diparis7k",
  logoUrl: null,
  watermark: null,
  presetId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(streamersApi.listStreamers).mockReset().mockResolvedValue([sampleStreamer]);
  vi.mocked(streamersApi.createStreamer).mockReset().mockResolvedValue({ ...sampleStreamer, id: "s2", name: "Novo" });
  vi.mocked(streamersApi.updateStreamer).mockReset().mockResolvedValue({ ...sampleStreamer, name: "Nome Editado" });
  vi.mocked(streamersApi.deleteStreamer).mockReset().mockResolvedValue(undefined);
});

describe("StreamersPage", () => {
  it("lists streamers fetched from the API", async () => {
    render(<StreamersPage />);
    expect(await screen.findByText("DiParis7k")).toBeInTheDocument();
  });

  it("creates a new streamer through the form", async () => {
    const user = userEvent.setup();
    render(<StreamersPage />);
    await screen.findByText("DiParis7k");

    await user.click(screen.getByRole("button", { name: "+ Novo Streamer" }));
    await user.type(screen.getByPlaceholderText("Nome"), "Novo");
    await user.type(screen.getByPlaceholderText("Username"), "novo");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(streamersApi.createStreamer).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Novo", username: "novo" })
      );
    });
  });

  it("edits an existing streamer", async () => {
    const user = userEvent.setup();
    render(<StreamersPage />);
    await screen.findByText("DiParis7k");

    await user.click(screen.getByRole("button", { name: "Editar" }));
    const nameInput = screen.getByPlaceholderText("Nome") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Nome Editado");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(streamersApi.updateStreamer).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({ name: "Nome Editado" })
      );
    });
  });

  it("shows an inline error and stops showing Salvando… when creating a streamer fails", async () => {
    vi.mocked(streamersApi.createStreamer).mockRejectedValueOnce(
      new ApiError(409, "duplicate_username", "Username já está em uso")
    );
    const user = userEvent.setup();
    render(<StreamersPage />);
    await screen.findByText("DiParis7k");

    await user.click(screen.getByRole("button", { name: "+ Novo Streamer" }));
    await user.type(screen.getByPlaceholderText("Nome"), "Novo");
    await user.type(screen.getByPlaceholderText("Username"), "novo");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Username já está em uso")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).not.toBeDisabled();
  });

  it("does not delete a streamer until the inline confirmation is accepted", async () => {
    const user = userEvent.setup();
    render(<StreamersPage />);
    await screen.findByText("DiParis7k");

    await user.click(screen.getByRole("button", { name: "Excluir" }));

    expect(streamersApi.deleteStreamer).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirmar exclusão?" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar exclusão?" }));

    await waitFor(() => {
      expect(streamersApi.deleteStreamer).toHaveBeenCalledWith("s1");
    });
  });

  it("cancels the inline delete confirmation without deleting", async () => {
    const user = userEvent.setup();
    render(<StreamersPage />);
    await screen.findByText("DiParis7k");

    await user.click(screen.getByRole("button", { name: "Excluir" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(streamersApi.deleteStreamer).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Excluir" })).toBeInTheDocument();
  });
});
