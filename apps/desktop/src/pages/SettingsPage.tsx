import { useEffect, useState } from "react";
import { authedRequest } from "../services/authedRequest";
import { useAuth } from "../hooks/useAuth";
import type { AuthUser, LicenseSummary } from "../types";

type Tab = "account" | "general" | "processing" | "ai";

interface MeResponse {
  user: AuthUser;
  license: LicenseSummary | null;
}

export function SettingsPage() {
  const { logout } = useAuth();
  const [tab, setTab] = useState<Tab>("account");
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    authedRequest<MeResponse>("/auth/me")
      .then(setMe)
      .catch(() => {
        // handled globally via OfflineBanner / session-expired modal
      });
  }, []);

  return (
    <div className="settings-page">
      <h1>Configurações</h1>
      <div className="settings-tabs">
        <button className={tab === "account" ? "active" : ""} onClick={() => setTab("account")}>
          Conta
        </button>
        <button className={tab === "general" ? "active" : ""} onClick={() => setTab("general")}>
          Geral
        </button>
        <button className={tab === "processing" ? "active" : ""} onClick={() => setTab("processing")}>
          Processamento
        </button>
        <button className={tab === "ai" ? "active" : ""} onClick={() => setTab("ai")}>
          IA
        </button>
      </div>
      {tab === "account" ? (
        me ? (
          <div className="settings-panel">
            <p>Email: {me.user.email}</p>
            <p>Plano: {me.license?.plan ?? "—"}</p>
            <p>Status da licença: {me.license?.status ?? "—"}</p>
            <p>
              Expira em:{" "}
              {me.license?.expiresAt ? new Date(me.license.expiresAt).toLocaleDateString("pt-BR") : "—"}
            </p>
            <p>Dispositivo: {me.license?.hwid ?? "—"}</p>
            <button onClick={() => void logout()}>Sair</button>
          </div>
        ) : (
          <p>Carregando…</p>
        )
      ) : (
        <p>Em breve.</p>
      )}
    </div>
  );
}
