import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginPage } from "./LoginPage";
import { ApiError } from "../services/apiClient";

const activateMock = vi.fn();
const loginMock = vi.fn();

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ activate: activateMock, login: loginMock }),
}));

beforeEach(() => {
  activateMock.mockReset();
  loginMock.mockReset();
});

describe("LoginPage", () => {
  it("activates a key with the entered code, email, and password", async () => {
    activateMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("LUC-XXXX-XXXX-XXXX"), "LLZ-AAAA-BBBB-CCCC");
    await user.type(screen.getByPlaceholderText("Email"), "user@example.com");
    await user.type(screen.getByPlaceholderText("Senha"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "Ativar acesso" }));

    await waitFor(() => {
      expect(activateMock).toHaveBeenCalledWith("LLZ-AAAA-BBBB-CCCC", "user@example.com", "supersecret123");
    });
  });

  it("switches to login mode and calls login instead of activate", async () => {
    loginMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Já tenho conta" }));
    await user.type(screen.getByPlaceholderText("Email"), "user@example.com");
    await user.type(screen.getByPlaceholderText("Senha"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith("user@example.com", "supersecret123");
    });
  });

  it("shows the server's error message when activation fails", async () => {
    activateMock.mockRejectedValue(new ApiError(403, "key_revoked", "Key revogada"));
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("LUC-XXXX-XXXX-XXXX"), "LLZ-AAAA-BBBB-CCCC");
    await user.type(screen.getByPlaceholderText("Email"), "user@example.com");
    await user.type(screen.getByPlaceholderText("Senha"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "Ativar acesso" }));

    expect(await screen.findByText("Key revogada")).toBeInTheDocument();
  });
});
