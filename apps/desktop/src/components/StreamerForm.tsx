import { useState, type FormEvent } from "react";
import type { Streamer } from "../types";
import type { StreamerInput } from "../services/streamersApi";

interface StreamerFormProps {
  streamer: Streamer | null;
  onSave: (input: StreamerInput) => Promise<void>;
  onCancel: () => void;
}

export function StreamerForm({ streamer, onSave, onCancel }: StreamerFormProps) {
  const [name, setName] = useState(streamer?.name ?? "");
  const [username, setUsername] = useState(streamer?.username ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    await onSave({ name, username });
    setSaving(false);
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
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
