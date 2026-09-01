import type { Clip, ClipCategory } from "../types";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

interface ClipCardProps {
  clip: Clip;
  onApprove: () => void;
  onReject: () => void;
  onEdit?: () => void;
}

const CATEGORY_LABELS: Record<ClipCategory, string> = {
  PLAY: "Jogada",
  FUNNY: "Engraçado",
  REACTION: "Reação",
  FAIL: "Fail",
  CLUTCH: "Clutch",
  SPOKEN_MOMENT: "Momento falado",
  IMPORTANT_MOMENT: "Momento importante",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ClipCard({ clip, onApprove, onReject, onEdit }: ClipCardProps) {
  const duration = clip.endTime - clip.startTime;

  return (
    <div className="clip-card">
      <h3>{clip.title ?? "Clipe sem título"}</h3>
      <p>{clip.category ? CATEGORY_LABELS[clip.category] : "—"}</p>
      <p>Pontuação: {clip.score ?? "—"}</p>
      {clip.scoreReason && <p className="clip-reason">{clip.scoreReason}</p>}
      <p>Duração: {formatDuration(duration)}</p>

      {clip.status === "DETECTED" && (
        <div className="clip-actions">
          <button className="btn-primary" onClick={onApprove}>Aprovar</button>
          <button onClick={onReject}>Rejeitar</button>
        </div>
      )}
      {clip.status === "APPROVED" && (
        <div className="clip-actions">
          <p className="clip-status-approved">Aprovado</p>
          {clip.latestRender?.status === "FAILED" && (
            <p className="form-error">{clip.latestRender.error ?? "Falha ao renderizar"}</p>
          )}
          {onEdit && <button onClick={onEdit}>Editar</button>}
        </div>
      )}
      {clip.status === "RENDERING" && (
        <div className="clip-actions">
          <p className="clip-status-rendering">Renderizando… ({clip.latestRender?.progress ?? 0}%)</p>
        </div>
      )}
      {clip.status === "COMPLETED" && (
        <div className="clip-actions">
          <p className="clip-status-approved">Renderizado</p>
          {onEdit && <button onClick={onEdit}>Editar</button>}
          {clip.latestRender?.outputPath && (
            <button onClick={() => void revealItemInDir(clip.latestRender!.outputPath!)}>Abrir arquivo</button>
          )}
        </div>
      )}
      {clip.status === "REJECTED" && <p className="clip-status-rejected">Rejeitado</p>}
    </div>
  );
}
