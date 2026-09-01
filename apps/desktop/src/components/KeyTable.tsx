import type { LicenseKey } from "../types";

interface KeyTableProps {
  keys: LicenseKey[];
  onRevoke: (id: string) => void;
  onResetDevice: (id: string) => void;
  revokingId?: string | null;
  resettingId?: string | null;
}

export function KeyTable({ keys, onRevoke, onResetDevice, revokingId = null, resettingId = null }: KeyTableProps) {
  return (
    <div className="key-table-wrapper">
      <table className="key-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Plano</th>
            <th>Status</th>
            <th>Usuário</th>
            <th>Expira</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id}>
              <td>{key.code}</td>
              <td>{key.plan}</td>
              <td>{key.status}</td>
              <td>{key.user?.email ?? "—"}</td>
              <td>{key.expiresAt ? new Date(key.expiresAt).toLocaleDateString("pt-BR") : "—"}</td>
              <td>
                <button onClick={() => void navigator.clipboard.writeText(key.code).catch(() => {})}>Copiar</button>
                {key.status !== "REVOKED" && (
                  <button disabled={revokingId === key.id} onClick={() => onRevoke(key.id)}>
                    {revokingId === key.id ? "Revogando…" : "Revogar"}
                  </button>
                )}
                {key.status === "ACTIVE" && key.deviceId && (
                  <button disabled={resettingId === key.id} onClick={() => onResetDevice(key.id)}>
                    {resettingId === key.id ? "Resetando…" : "Resetar dispositivo"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
