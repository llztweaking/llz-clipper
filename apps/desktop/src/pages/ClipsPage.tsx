import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useVods } from "../hooks/useVods";
import { useClips } from "../hooks/useClips";
import { ClipCard } from "../components/ClipCard";

export function ClipsPage() {
  const navigate = useNavigate();
  const { vods } = useVods();
  const completedVods = vods.filter((vod) => vod.jobs?.[0]?.status === "COMPLETED");
  const [selectedVodId, setSelectedVodId] = useState<string>("");
  const { clips, loading, approve, reject } = useClips(selectedVodId || null);

  return (
    <div className="clips-page">
      <h1>Clipes</h1>
      <select value={selectedVodId} onChange={(event) => setSelectedVodId(event.target.value)}>
        <option value="">Selecione um VOD</option>
        {completedVods.map((vod) => (
          <option key={vod.id} value={vod.id}>
            {vod.filename}
          </option>
        ))}
      </select>

      {!selectedVodId ? (
        <p>Selecione um VOD para ver os clipes detectados.</p>
      ) : loading ? (
        <p>Carregando…</p>
      ) : clips.length === 0 ? (
        <p>Nenhum clipe detectado para este VOD.</p>
      ) : (
        <div className="clips-grid">
          {clips.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              onApprove={() => void approve(clip.id)}
              onReject={() => void reject(clip.id)}
              onEdit={() => navigate(`/editor/${clip.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
