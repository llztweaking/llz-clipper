import { useState, type FormEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useVods } from "../hooks/useVods";
import { useStreamers } from "../hooks/useStreamers";
import { ApiError } from "../services/apiClient";
import { VodCard } from "../components/VodCard";

const ALLOWED_EXTENSIONS = ["mp4", "mkv", "mov", "webm"];

export function VodPage() {
  const { vods, loading, create, remove, retry } = useVods();
  const { streamers } = useStreamers();
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [streamerId, setStreamerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handlePickFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "VOD", extensions: ALLOWED_EXTENSIONS }],
    });
    if (typeof selected === "string") {
      setSourcePath(selected);
      setError(null);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!sourcePath || !streamerId) return;
    setCreating(true);
    setError(null);
    try {
      await create({ streamerId, sourcePath });
      setSourcePath(null);
      setStreamerId("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="vod-page">
      <h1>VOD</h1>
      <form onSubmit={handleSubmit} className="vod-form">
        <button type="button" onClick={() => void handlePickFile()}>
          + Selecionar VOD
        </button>
        {sourcePath && <p className="vod-selected-path">{sourcePath}</p>}
        <select value={streamerId} onChange={(event) => setStreamerId(event.target.value)} required>
          <option value="">Selecione um streamer</option>
          {streamers.map((streamer) => (
            <option key={streamer.id} value={streamer.id}>
              {streamer.name}
            </option>
          ))}
        </select>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={!sourcePath || !streamerId || creating}>
          {creating ? "Adicionando…" : "Adicionar VOD"}
        </button>
      </form>

      {loading ? (
        <p>Carregando…</p>
      ) : (
        <div className="vod-grid">
          {vods.map((vod) => (
            <VodCard key={vod.id} vod={vod} onDelete={() => void remove(vod.id)} onRetry={() => void retry(vod.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
