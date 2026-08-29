import { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import { restoreSession } from "./services/authApi";
import { Sidebar } from "./components/Sidebar";
import { OfflineBanner } from "./components/OfflineBanner";
import { SessionExpiredModal } from "./components/SessionExpiredModal";
import { LoginPage } from "./pages/LoginPage";
import { StreamersPage } from "./pages/StreamersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AdminPage } from "./pages/AdminPage";
import { VodPage } from "./pages/VodPage";
import { ClipsPage } from "./pages/ClipsPage";
import { EditorPage } from "./pages/EditorPage";

function AppShell() {
  const role = useAuthStore((state) => state.user?.role);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
        <Routes>
          <Route path="/vod" element={<VodPage />} />
          <Route path="/clips" element={<ClipsPage />} />
          <Route path="/editor/:clipId" element={<EditorPage />} />
          <Route path="/streamers" element={<StreamersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/admin"
            element={role === "ADMIN" ? <AdminPage /> : <Navigate to="/streamers" replace />}
          />
          <Route path="*" element={<Navigate to="/streamers" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionExpired = useAuthStore((state) => state.sessionExpired);
  const setSession = useAuthStore((state) => state.setSession);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    restoreSession()
      .then((result) => {
        if (result) setSession(result.accessToken, result.refreshToken, result.user);
      })
      .finally(() => setBootstrapping(false));
  }, [setSession]);

  if (bootstrapping) {
    return <div className="app-loading">Carregando…</div>;
  }

  return (
    <HashRouter>
      <OfflineBanner />
      {sessionExpired && <SessionExpiredModal />}
      {accessToken ? <AppShell /> : <LoginPage />}
    </HashRouter>
  );
}

export default App;
