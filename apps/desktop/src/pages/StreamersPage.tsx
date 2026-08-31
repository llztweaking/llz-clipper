import { useState } from "react";
import { useStreamers } from "../hooks/useStreamers";
import { StreamerForm } from "../components/StreamerForm";
import type { Streamer } from "../types";
import type { StreamerInput } from "../services/streamersApi";

export function StreamersPage() {
  const { streamers, loading, create, update, remove } = useStreamers();
  const [editing, setEditing] = useState<Streamer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(streamer: Streamer) {
    setEditing(streamer);
    setShowForm(true);
  }

  async function handleSave(input: StreamerInput) {
    if (editing) {
      await update(editing.id, input);
    } else {
      await create(input);
    }
    setShowForm(false);
  }

  async function handleConfirmDelete(id: string) {
    setConfirmingId(null);
    await remove(id);
  }

  return (
    <div className="streamers-page">
      <div className="page-header">
        <h1>Streamers</h1>
        <button className="btn-primary" onClick={openCreate}>+ Novo Streamer</button>
      </div>
      {loading ? (
        <p>Carregando…</p>
      ) : (
        <div className="streamer-grid">
          {streamers.map((streamer) => (
            <div key={streamer.id} className="streamer-card">
              <h3>{streamer.name}</h3>
              <p>{streamer.username}</p>
              <button onClick={() => openEdit(streamer)}>Editar</button>
              {confirmingId === streamer.id ? (
                <>
                  <button onClick={() => void handleConfirmDelete(streamer.id)}>Confirmar exclusão?</button>
                  <button onClick={() => setConfirmingId(null)}>Cancelar</button>
                </>
              ) : (
                <button onClick={() => setConfirmingId(streamer.id)}>Excluir</button>
              )}
            </div>
          ))}
        </div>
      )}
      {showForm && <StreamerForm streamer={editing} onSave={handleSave} onCancel={() => setShowForm(false)} />}
    </div>
  );
}
