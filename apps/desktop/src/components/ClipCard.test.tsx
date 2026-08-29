import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClipCard } from "./ClipCard";
import type { Clip } from "../types";

const baseClip: Clip = {
  id: "c1",
  vodId: "v1",
  startTime: 10,
  endTime: 40,
  title: "Que jogada incrível",
  category: "PLAY",
  score: 80,
  scoreReason: "palavra-chave detectada (PLAY) + pico de energia no áudio",
  status: "DETECTED",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("ClipCard", () => {
  it("shows the title, category, score, reason, and duration", () => {
    render(<ClipCard clip={baseClip} onApprove={vi.fn()} onReject={vi.fn()} />);

    expect(screen.getByText("Que jogada incrível")).toBeInTheDocument();
    expect(screen.getByText("Jogada")).toBeInTheDocument();
    expect(screen.getByText(/80/)).toBeInTheDocument();
    expect(screen.getByText(/pico de energia/)).toBeInTheDocument();
    expect(screen.getByText(/0:30/)).toBeInTheDocument();
  });

  it("calls onApprove when Aprovar is clicked", async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();
    render(<ClipCard clip={baseClip} onApprove={onApprove} onReject={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Aprovar" }));
    expect(onApprove).toHaveBeenCalled();
  });

  it("calls onReject when Rejeitar is clicked", async () => {
    const onReject = vi.fn();
    const user = userEvent.setup();
    render(<ClipCard clip={baseClip} onApprove={vi.fn()} onReject={onReject} />);

    await user.click(screen.getByRole("button", { name: "Rejeitar" }));
    expect(onReject).toHaveBeenCalled();
  });

  it("shows an approved status message and an Editar button once approved", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<ClipCard clip={{ ...baseClip, status: "APPROVED" }} onApprove={vi.fn()} onReject={vi.fn()} onEdit={onEdit} />);

    expect(screen.getByText("Aprovado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(onEdit).toHaveBeenCalled();
  });

  it("shows a rejected status message instead of action buttons once rejected", () => {
    render(<ClipCard clip={{ ...baseClip, status: "REJECTED" }} onApprove={vi.fn()} onReject={vi.fn()} />);

    expect(screen.getByText("Rejeitado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rejeitar" })).not.toBeInTheDocument();
  });
});
