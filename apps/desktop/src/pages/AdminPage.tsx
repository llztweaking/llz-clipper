import { useEffect, useState } from "react";
import * as adminApi from "../services/adminApi";
import { KeyTable } from "../components/KeyTable";
import type { LicenseKey, PlanType } from "../types";

export function AdminPage() {
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  async function load() {
    setLoading(true);
    try {
      const result = await adminApi.listKeys({ status: statusFilter || undefined, page });
      setKeys(result.items);
      setTotal(result.total);
      setPageSize(result.pageSize);
    } catch {
      // OfflineBanner already surfaces network failures; this just needs to stop spinning.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page]);

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  async function handleGenerate(plan: PlanType) {
    setGenerating(true);
    try {
      await adminApi.createKey(plan);
      await load();
    } catch {
      // OfflineBanner already surfaces network failures globally; the button
      // just needs to re-enable rather than hang forever.
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateBulk(plan: PlanType, count: number) {
    setGenerating(true);
    try {
      await adminApi.createKeysBulk(plan, count);
      await load();
    } catch {
      // Same as above — fail silently here, OfflineBanner covers the network case.
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      await adminApi.revokeKey(id);
      await load();
    } catch {
      // Same as above — fail silently here, OfflineBanner covers the network case.
    } finally {
      setRevokingId(null);
    }
  }

  const canGoPrev = page > 1;
  const canGoNext = page * pageSize < total;

  return (
    <div className="admin-page">
      <h1>Admin</h1>
      <div className="admin-actions">
        <button disabled={generating} onClick={() => void handleGenerate("MONTHLY")}>
          Gerar Key (Mensal)
        </button>
        <button disabled={generating} onClick={() => void handleGenerate("QUARTERLY")}>
          Gerar Key (Trimestral)
        </button>
        <button disabled={generating} onClick={() => void handleGenerateBulk("MONTHLY", 10)}>
          Gerar 10 Keys
        </button>
        <button disabled={generating} onClick={() => void handleGenerateBulk("MONTHLY", 50)}>
          Gerar 50 Keys
        </button>
      </div>
      <select value={statusFilter} onChange={(event) => handleStatusFilterChange(event.target.value)}>
        <option value="">Todos os status</option>
        <option value="UNUSED">UNUSED</option>
        <option value="ACTIVE">ACTIVE</option>
        <option value="EXPIRED">EXPIRED</option>
        <option value="REVOKED">REVOKED</option>
      </select>
      {loading ? (
        <p>Carregando…</p>
      ) : (
        <>
          <KeyTable keys={keys} onRevoke={handleRevoke} revokingId={revokingId} />
          <div className="pagination">
            <button disabled={!canGoPrev} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </button>
            <span>Página {page}</span>
            <button disabled={!canGoNext} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </button>
          </div>
        </>
      )}
    </div>
  );
}
