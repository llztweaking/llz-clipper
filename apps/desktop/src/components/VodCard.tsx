import { useEffect, useState } from "react";
import type { Vod } from "../types";
import { getVodThumbnail } from "../services/vodsApi";

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
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const job = vod.jobs?.[0];
  const isActive = job && job.status !== "COMPLETED" && job.status !== "FAILED";
  const isCompleted = job?.status === "COMPLETED";

  // Thumbnails only exist once processing succeeded. The API requires the
  // same Bearer-token auth as every other request, which a plain <img src>
  // can't send, so we fetch it as a Blob through the authenticated client and
  // turn it into an object URL. If the fetch fails (e.g. no thumbnail was
  // generated) we simply don't show an image, instead of a broken icon.
  useEffect(() => {
    if (!isCompleted) {
      setThumbnailUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    getVodThumbnail(vod.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setThumbnailUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setThumbnailUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [vod.id, isCompleted]);

  return (
    <div className="vod-card">
      <h3>{vod.filename}</h3>
      {vod.streamer && <p>{vod.streamer.name}</p>}

      {thumbnailUrl && <img src={thumbnailUrl} alt={`Thumbnail de ${vod.filename}`} className="vod-thumbnail" />}

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
