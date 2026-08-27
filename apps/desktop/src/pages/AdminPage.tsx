import { useEffect, useState } from "react";
import * as adminApi from "../services/adminApi";
import { KeyTable } from "../components/KeyTable";
import type { LicenseKey, PlanType } from "../types";

export function AdminPage() {
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const result = await adminApi.listKeys({ status: statusFilter || undefined });
      setKeys(result.items);
    } catch {
      // OfflineBanner already surfaces network failures; this just needs to stop spinning.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleGenerate(plan: PlanType) {
    await adminApi.createKey(plan);
    await load();
  }

  async function handleGenerateBulk(plan: PlanType, count: number) {
    await adminApi.createKeysBulk(plan, count);
    await load();
  }

  async function handleRevoke(id: string) {
    await adminApi.revokeKey(id);
    await load();
  }

  return (
    <div className="admin-page">
      <h1>Admin</h1>
      <div className="admin-actions">
        <button onClick={() => void handleGenerate("MONTHLY")}>Gerar Key (Mensal)</button>
        <button onClick={() => void handleGenerate("QUARTERLY")}>Gerar Key (Trimestral)</button>
        <button onClick={() => void handleGenerateBulk("MONTHLY", 10)}>Gerar 10 Keys</button>
        <button onClick={() => void handleGenerateBulk("MONTHLY", 50)}>Gerar 50 Keys</button>
      </div>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
        <option value="">Todos os status</option>
        <option value="UNUSED">UNUSED</option>
        <option value="ACTIVE">ACTIVE</option>
        <option value="EXPIRED">EXPIRED</option>
        <option value="REVOKED">REVOKED</option>
      </select>
      {loading ? <p>Carregando…</p> : <KeyTable keys={keys} onRevoke={handleRevoke} />}
    </div>
  );
}
