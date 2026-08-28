import { useState } from "react";
import type { Vod } from "../types";

interface VodCardProps {
  vod: Vod;
  onDelete: () => void;
  onRetry: () => void;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatSize(sizeBytes: string | null): string {
  if (!sizeBytes) return "—";
  const gb = Number(sizeBytes) / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
}

export function VodCard({ vod, onDelete, onRetry }: VodCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const job = vod.jobs?.[0];
  const isActive = job && job.status !== "COMPLETED" && job.status !== "FAILED";

  return (
    <div className="vod-card">
      <h3>{vod.filename}</h3>
      {vod.streamer && <p>{vod.streamer.name}</p>}

      {isActive && (
        <div className="vod-progress">
          <div className="vod-progress-bar" style={{ width: `${job!.progress}%` }} />
          <p>
            {job!.currentStep ?? "Processando…"} ({job!.progress}%)
          </p>
        </div>
      )}

      {job?.status === "COMPLETED" && (
        <ul className="vod-metadata">
          <li>Duração: {formatDuration(vod.durationSec)}</li>
          <li>Resolução: {vod.width && vod.height ? `${vod.width}x${vod.height}` : "—"}</li>
          <li>FPS: {vod.fps ?? "—"}</li>
          <li>Tamanho: {formatSize(vod.sizeBytes)}</li>
        </ul>
      )}

      {job?.status === "FAILED" && (
        <div>
          <p className="form-error">{job.error ?? "Falha ao processar"}</p>
          <button onClick={onRetry}>Tentar novamente</button>
        </div>
      )}

      {confirmingDelete ? (
        <>
          <span>Confirmar exclusão?</span>
          <button onClick={onDelete}>Confirmar</button>
          <button onClick={() => setConfirmingDelete(false)}>Cancelar</button>
        </>
      ) : (
        <button onClick={() => setConfirmingDelete(true)}>Excluir</button>
      )}
    </div>
  );
}
