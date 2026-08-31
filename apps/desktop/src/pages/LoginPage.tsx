import { useState, type FormEvent } from "react";
import { useAuth } from "../hooks/useAuth";
import { ApiError } from "../services/apiClient";
import { Logo } from "../components/Logo";

type Mode = "activate" | "login";

export function LoginPage() {
  const { activate, login } = useAuth();
  const [mode, setMode] = useState<Mode>("activate");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "activate") {
        await activate(code, email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <h1>
        <Logo size="lg" />
      </h1>
      <div className="login-toggle">
        <button type="button" onClick={() => setMode("activate")}>
          Ativar licença
        </button>
        <button type="button" onClick={() => setMode("login")}>
          Já tenho conta
        </button>
      </div>
      <form onSubmit={handleSubmit}>
        {mode === "activate" && (
          <input
            placeholder="LUC-XXXX-XXXX-XXXX"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Aguarde…" : mode === "activate" ? "Ativar acesso" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
