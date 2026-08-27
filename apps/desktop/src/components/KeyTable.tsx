import type { LicenseKey } from "../types";

interface KeyTableProps {
  keys: LicenseKey[];
  onRevoke: (id: string) => void;
}

export function KeyTable({ keys, onRevoke }: KeyTableProps) {
  return (
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
              <button onClick={() => navigator.clipboard.writeText(key.code)}>Copiar</button>
              {key.status !== "REVOKED" && <button onClick={() => onRevoke(key.id)}>Revogar</button>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
