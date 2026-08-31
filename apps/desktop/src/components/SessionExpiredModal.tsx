import { useAuthStore } from "../stores/authStore";

export function SessionExpiredModal() {
  const clearSessionExpired = useAuthStore((state) => state.clearSessionExpired);

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Sua sessão expirou</h2>
        <button className="btn-primary" onClick={clearSessionExpired}>Voltar ao login</button>
      </div>
    </div>
  );
}
