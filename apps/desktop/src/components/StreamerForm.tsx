import { useState, type FormEvent } from "react";
import type { Streamer } from "../types";
import type { StreamerInput } from "../services/streamersApi";
import { ApiError } from "../services/apiClient";

interface StreamerFormProps {
  streamer: Streamer | null;
  onSave: (input: StreamerInput) => Promise<void>;
  onCancel: () => void;
}

export function StreamerForm({ streamer, onSave, onCancel }: StreamerFormProps) {
  const [name, setName] = useState(streamer?.name ?? "");
  const [username, setUsername] = useState(streamer?.username ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave({ name, username });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar o streamer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <form className="modal" onSubmit={handleSubmit}>
        <input placeholder="Nome" value={name} onChange={(event) => setName(event.target.value)} required />
        <input
          placeholder="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
