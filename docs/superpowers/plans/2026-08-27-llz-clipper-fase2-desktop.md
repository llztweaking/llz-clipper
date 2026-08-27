# LLZ CLIPPER — Fase 2 (Desktop Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real LLZ CLIPPER Windows desktop app (Tauri v2 + React + TypeScript) — login/license activation, a sidebar shell, and fully functional Streamers/Settings/Admin screens wired to the Fase 1 API — with VOD/Clips/Editor as explicit placeholders.

**Architecture:** `apps/desktop` becomes a real npm workspace containing a Tauri v2 project. Two native Rust commands (`get_hwid`, and `save_session`/`load_session`/`clear_session`) bridge OS-level concerns (machine identity, secure credential storage) that the browser-side React app cannot do itself. The React app talks to the Fase 1 API over plain HTTP through a small `apiClient`, with a Zustand store holding the in-memory session and a thin auth-aware request wrapper that retries once on token expiry.

**Tech Stack:** Tauri v2, React 19, TypeScript, Vite 7, React Router (`HashRouter`), Zustand, Vitest + React Testing Library, Rust crates `keyring` (v1 API) and `winreg`.

**Spec:** `docs/superpowers/specs/2026-08-27-llz-clipper-fase2-desktop-design.md`

## Global Constraints

- `apps/desktop` does **not** depend on `@llz-clipper/types` — it defines its own local request/response types in `src/types.ts`. The backend packages use `moduleResolution: node16` (CommonJS); the Vite frontend uses `moduleResolution: bundler` (ESM). Mixing them across a workspace boundary is unnecessary risk for a handful of shared shapes — duplicating them locally is simpler and keeps `apps/desktop` self-contained.
- No secret, credential, or refresh token is ever written to disk by the **frontend**. The refresh token only ever reaches disk via the Rust `keyring` commands (Windows Credential Manager); the frontend only ever holds it in memory (Zustand).
- HWID is computed in Rust (`HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid` via the `winreg` crate), never in JS — verified readable without elevation on this machine.
- Rust toolchain on this machine is GNU (`stable-x86_64-pc-windows-gnu`), not MSVC — verified that Tauri v2, `keyring`, and `winreg` all compile cleanly under it via `cargo check`.
- No automated Rust tests beyond `cargo check` compiling cleanly — per the spec's explicit Testing section, the native commands are thin enough that mocking the Windows Credential Manager isn't worth the cost here. Manual verification via `npm run tauri dev` covers them.
- Every async UI action (form submit, revoke, delete) shows a local loading state on its own control — never a dead button, never an infinite spinner with no context.
- Styling is plain CSS with custom properties (`src/styles/tokens.css`) — no UI framework, no Tailwind.
- Run all shell commands through a POSIX-style shell (Git Bash), consistent with the rest of this repo.

## Environment already available (do not redo)

Node 22, Rust GNU toolchain + GCC/MinGW on PATH. Verified during planning: `cargo check` succeeds for a Tauri v2 + `keyring` v4 (default `v1` feature) + `winreg` v0.56 project on this machine using the GNU toolchain — no MSVC Build Tools needed.

---

### Task 1: Backend — add license summary to `GET /auth/me`

The Fase 2 Settings screen needs to show plan, license status, expiry, and
device HWID — none of which the current `GET /auth/me` response includes
(it only returns `{ user: { id, email, role } }`). This is a small,
backward-compatible extension of the existing Fase 1 endpoint, done here
because the desktop screen that needs it is what this plan builds.

**Files:**
- Modify: `services/api/src/services/licenseService.ts`
- Modify: `services/api/src/routes/auth.routes.ts`
- Modify: `services/api/test/auth.sessionFlow.test.ts`

**Interfaces:**
- Produces: `getUserLicenseSummary(userId: string): Promise<{ plan; status; activatedAt; expiresAt; hwid } | null>`, and `GET /auth/me` now returns `{ user, license }` instead of just `{ user }`.

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe("GET /auth/me", ...)` block in
`services/api/test/auth.sessionFlow.test.ts` (after the existing tests in
that block):

```ts
  it("includes the active license summary", async () => {
    const activated = await activate();
    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${activated.accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.license).toMatchObject({ plan: "MONTHLY", status: "ACTIVE" });
    expect(body.license.expiresAt).toBeDefined();
    expect(body.license.hwid).toBe("hwid-session");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/api`
Expected: FAIL — `body.license` is `undefined`.

- [ ] **Step 3: Implement `getUserLicenseSummary`**

Add to `services/api/src/services/licenseService.ts` (append at the end of
the file):

```ts
export async function getUserLicenseSummary(userId: string) {
  const key = await prisma.licenseKey.findFirst({
    where: { userId, status: "ACTIVE" },
    include: { device: true },
    orderBy: { activatedAt: "desc" },
  });

  if (!key) return null;

  return {
    plan: key.plan,
    status: key.status,
    activatedAt: key.activatedAt,
    expiresAt: key.expiresAt,
    hwid: key.device?.hwid ?? null,
  };
}
```

- [ ] **Step 4: Update the `/me` route handler**

In `services/api/src/routes/auth.routes.ts`, add the import:

```ts
import { activateKey, LicenseError, getUserLicenseSummary } from "../services/licenseService";
```

Replace the `/me` handler:

```ts
  app.get("/me", { preHandler: authenticate }, async (request, reply) => {
    const license = await getUserLicenseSummary(request.authUser!.id);
    return reply.code(200).send({ user: request.authUser, license });
  });
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -w @llz-clipper/api`
Expected: PASS (all previous tests + the new one).

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck -w @llz-clipper/api`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add services/api
git commit -m "feat(api): include active license summary in GET /auth/me"
```

---

### Task 2: Scaffold the Tauri v2 desktop app

**Files:**
- Create (via CLI, then edited): `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/types.ts`
- Create: `apps/desktop/src/styles/tokens.css`
- Create: `apps/desktop/src/styles/global.css`
- Create: `apps/desktop/vitest.config.ts`
- Create: `apps/desktop/src/test/setup.ts`
- Modify: `apps/desktop/src/main.tsx`

**Interfaces:**
- Produces: the `@llz-clipper/desktop` npm workspace member; the shared local types (`AuthUser`, `AuthResult`, `Streamer`, `LicenseKey`, `UsageLog`, `PaginatedResult<T>`, `ActivateKeyInput`, `LoginInput`, `PlanType`, `KeyStatus`) that every later frontend task imports from `../types`.

- [ ] **Step 1: Scaffold via the official Tauri CLI**

Run from the repo root:

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
npm create tauri-app@latest -- apps/desktop --manager npm --template react-ts --identifier com.llzclipper.desktop --yes --force
```

This overwrites the placeholder `apps/desktop/package.json` with a real
Tauri v2 + React 19 + Vite 7 scaffold, including `src-tauri/` (Rust side,
with default icons already generated) and a working `tsconfig.json`.

- [ ] **Step 2: Rename the package and add scripts**

Edit `apps/desktop/package.json` — change `"name": "desktop"` to
`"name": "@llz-clipper/desktop"`, and add `"test"` and `"typecheck"` to
`scripts`:

```json
{
  "name": "@llz-clipper/desktop",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

(Keep the generated `dependencies`/`devDependencies` — they'll be added to
below.)

- [ ] **Step 3: Rename the product in `tauri.conf.json`**

In `apps/desktop/src-tauri/tauri.conf.json`, change:
- `"productName": "desktop"` → `"productName": "LLZ CLIPPER"`
- `"windows": [{ "title": "desktop", ...}]` → `"windows": [{ "title": "LLZ CLIPPER", ...}]`

- [ ] **Step 4: Install the frontend dependencies this plan needs**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
npm install react-router-dom zustand -w @llz-clipper/desktop
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event -w @llz-clipper/desktop
```

- [ ] **Step 5: Create the local type definitions**

`apps/desktop/src/types.ts`:

```ts
export type PlanType = "MONTHLY" | "QUARTERLY";
export type KeyStatus = "UNUSED" | "ACTIVE" | "EXPIRED" | "REVOKED";
export type Role = "USER" | "ADMIN";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: AuthUser;
}

export interface ActivateKeyInput {
  code: string;
  email: string;
  password: string;
  hwid: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LicenseSummary {
  plan: PlanType;
  status: KeyStatus;
  activatedAt: string | null;
  expiresAt: string | null;
  hwid: string | null;
}

export interface Streamer {
  id: string;
  name: string;
  username: string;
  logoUrl: string | null;
  watermark: Record<string, unknown> | null;
  presetId: string | null;
  createdAt: string;
}

export interface LicenseKey {
  id: string;
  code: string;
  plan: PlanType;
  status: KeyStatus;
  createdAt: string;
  activatedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  userId: string | null;
  user?: { id: string; email: string } | null;
}

export interface UsageLog {
  id: string;
  userId: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
```

- [ ] **Step 6: Create the design tokens and global stylesheet**

`apps/desktop/src/styles/tokens.css`:

```css
:root {
  --bg: #0d0d0f;
  --surface: #17171a;
  --border: #2a2a2e;
  --text: #f2f2f3;
  --text-muted: #9a9aa0;
  --accent: #5b8cff;
  --danger: #e5555f;
}
```

`apps/desktop/src/styles/global.css`:

```css
@import "./tokens.css";

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, "Segoe UI", sans-serif;
}

button {
  cursor: pointer;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 14px;
}

button:disabled {
  opacity: 0.6;
  cursor: default;
}

input {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 14px;
}

.app-shell {
  display: flex;
  height: 100vh;
}

.sidebar {
  width: 220px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 16px 8px;
}

.sidebar-title {
  font-weight: 700;
  padding: 8px 12px 20px;
}

.sidebar-link {
  color: var(--text-muted);
  text-decoration: none;
  padding: 10px 12px;
  border-radius: 6px;
  display: block;
}

.sidebar-link.active {
  background: var(--bg);
  color: var(--text);
}

.app-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.offline-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: var(--danger);
  color: white;
  text-align: center;
  padding: 6px;
  z-index: 100;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 24px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-error {
  color: var(--danger);
  font-size: 13px;
}
```

- [ ] **Step 7: Wire the stylesheet and replace the demo `App.tsx`**

Replace `apps/desktop/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Replace `apps/desktop/src/App.tsx` with a temporary placeholder (this gets
replaced for real in Task 10):

```tsx
function App() {
  return <div>LLZ CLIPPER</div>;
}

export default App;
```

- [ ] **Step 8: Set up Vitest**

`apps/desktop/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

`apps/desktop/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 9: Verify the frontend builds and the Rust side compiles**

Run: `npm run build -w @llz-clipper/desktop`
Expected: exits 0, produces `apps/desktop/dist/`.

Run: `cd apps/desktop/src-tauri && cargo check`
Expected: `Finished` with no errors (this recompiles from a clean state
the first time and can take 1-2 minutes).

Run: `npm test -w @llz-clipper/desktop`
Expected: "No test files found" is fine at this point — there are no
tests yet.

- [ ] **Step 10: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop package-lock.json
git commit -m "feat(desktop): scaffold Tauri v2 + React + TypeScript app"
```

---

### Task 3: Rust — `get_hwid` command

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/mod.rs`
- Create: `apps/desktop/src-tauri/src/commands/hwid.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`

**Interfaces:**
- Produces: Tauri command `get_hwid() -> Result<String, String>`, invoked from the frontend as `invoke<string>("get_hwid")` (Task 8 onward).

- [ ] **Step 1: Add the `winreg` dependency**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER\apps\desktop\src-tauri"
cargo add winreg
```

- [ ] **Step 2: Write the command**

`apps/desktop/src-tauri/src/commands/hwid.rs`:

```rust
use winreg::enums::HKEY_LOCAL_MACHINE;
use winreg::RegKey;

#[tauri::command]
pub fn get_hwid() -> Result<String, String> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let cryptography = hklm
        .open_subkey("SOFTWARE\\Microsoft\\Cryptography")
        .map_err(|e| e.to_string())?;
    let machine_guid: String = cryptography
        .get_value("MachineGuid")
        .map_err(|e| e.to_string())?;
    Ok(machine_guid)
}
```

`apps/desktop/src-tauri/src/commands/mod.rs`:

```rust
pub mod hwid;
```

- [ ] **Step 3: Register the command**

In `apps/desktop/src-tauri/src/lib.rs`, replace the file with:

```rust
mod commands;

use commands::hwid::get_hwid;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_hwid])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

(This removes the scaffold's demo `greet` command — it's no longer used
anywhere.)

- [ ] **Step 4: Verify it compiles**

Run: `cargo check` (from `apps/desktop/src-tauri`)
Expected: `Finished` with no errors.

- [ ] **Step 5: Manually verify the command returns a real value**

Run: `npm run tauri dev -w @llz-clipper/desktop`

Once the window opens, open its DevTools (right-click → Inspect, or
`Ctrl+Shift+I`) and run in the console:

```js
window.__TAURI__.core.invoke("get_hwid").then(console.log)
```

Expected: logs a GUID string like `6671ecc5-4bc8-4eaf-a3a4-2045de185e41`
matching `Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Cryptography" -Name MachineGuid`
run in PowerShell. Close the app window when done.

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): add get_hwid Tauri command reading the Windows MachineGuid"
```

---

### Task 4: Rust — session storage commands (`keyring`)

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/session.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`

**Interfaces:**
- Produces: Tauri commands `save_session(refresh_token: String) -> Result<(), String>`, `load_session() -> Result<Option<String>, String>`, `clear_session() -> Result<(), String>` — invoked from the frontend as `invoke("save_session", { refreshToken })`, `invoke<string | null>("load_session")`, `invoke("clear_session")` (Tasks 6-8).

- [ ] **Step 1: Add the `keyring` dependency**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER\apps\desktop\src-tauri"
cargo add keyring
```

(This pulls in the `v1` feature by default, which provides the simple
`Entry`/`set_password`/`get_password`/`delete_credential` API backed by
the Windows Credential Manager on this platform.)

- [ ] **Step 2: Write the commands**

`apps/desktop/src-tauri/src/commands/session.rs`:

```rust
use keyring::{Entry, Error as KeyringError};

const SERVICE: &str = "llz-clipper";
const ACCOUNT: &str = "session";

#[tauri::command]
pub fn save_session(refresh_token: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    entry.set_password(&refresh_token).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_session() -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn clear_session() -> Result<(), String> {
    let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
```

`apps/desktop/src-tauri/src/commands/mod.rs`:

```rust
pub mod hwid;
pub mod session;
```

- [ ] **Step 3: Register the commands**

Replace `apps/desktop/src-tauri/src/lib.rs`:

```rust
mod commands;

use commands::hwid::get_hwid;
use commands::session::{clear_session, load_session, save_session};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_hwid,
            save_session,
            load_session,
            clear_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo check` (from `apps/desktop/src-tauri`)
Expected: `Finished` with no errors.

- [ ] **Step 5: Manually verify save/load/clear round-trip**

Run: `npm run tauri dev -w @llz-clipper/desktop`, open DevTools, run:

```js
const { invoke } = window.__TAURI__.core;
await invoke("save_session", { refreshToken: "test-token-123" });
await invoke("load_session"); // should log "test-token-123"
await invoke("clear_session");
await invoke("load_session"); // should log null
```

Expected: matches the comments above. Close the app window when done.

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): add session storage commands backed by the Windows Credential Manager"
```

---

### Task 5: `apiClient` (`rawRequest`) and the network status store (TDD)

**Files:**
- Create: `apps/desktop/src/stores/networkStore.ts`
- Create: `apps/desktop/src/services/apiClient.ts`
- Create: `apps/desktop/src/services/apiClient.test.ts`

**Interfaces:**
- Produces: `useNetworkStore` (Zustand store with `{ offline: boolean; setOffline(v: boolean): void }`), `ApiError` class (`status`, `code`, `message`), `rawRequest<T>(path: string, options?: { method?: string; body?: unknown; token?: string }): Promise<T>` — consumed by Tasks 6, 7, 11, 13.

- [ ] **Step 1: Write the network store (no test — trivial Zustand state, exercised via `apiClient.test.ts`)**

`apps/desktop/src/stores/networkStore.ts`:

```ts
import { create } from "zustand";

interface NetworkState {
  offline: boolean;
  setOffline: (offline: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  offline: false,
  setOffline: (offline) => set({ offline }),
}));
```

- [ ] **Step 2: Write the failing tests for `rawRequest`**

`apps/desktop/src/services/apiClient.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { rawRequest, ApiError } from "./apiClient";
import { useNetworkStore } from "../stores/networkStore";

beforeEach(() => {
  useNetworkStore.setState({ offline: false });
  vi.restoreAllMocks();
});

describe("rawRequest", () => {
  it("returns parsed JSON on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ hello: "world" }),
      })
    );

    const result = await rawRequest<{ hello: string }>("/ping");
    expect(result).toEqual({ hello: "world" });
    expect(useNetworkStore.getState().offline).toBe(false);
  });

  it("throws ApiError with the server's error code and message on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "key_not_found", message: "Key inválida" }),
      })
    );

    await expect(rawRequest("/auth/activate-key")).rejects.toMatchObject({
      status: 404,
      code: "key_not_found",
      message: "Key inválida",
    });
  });

  it("marks the network store offline and throws network_error when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(rawRequest("/health")).rejects.toMatchObject({ code: "network_error" });
    expect(useNetworkStore.getState().offline).toBe(true);
  });

  it("sends the Authorization header when a token is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await rawRequest("/streamers", { token: "abc123" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/streamers"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer abc123" }) })
    );
  });

  it("does not attempt to parse a body on a 204 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));
    const result = await rawRequest("/auth/logout", { method: "POST" });
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './apiClient'`.

- [ ] **Step 3: Implement `apiClient.ts`**

`apps/desktop/src/services/apiClient.ts`:

```ts
import { useNetworkStore } from "../stores/networkStore";

const API_BASE_URL = "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

export async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    useNetworkStore.getState().setOffline(false);
  } catch {
    useNetworkStore.getState().setOffline(true);
    throw new ApiError(0, "network_error", "Servidor indisponível");
  }

  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? "unknown_error", data.message ?? "Erro desconhecido");
  }

  return data as T;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): add apiClient rawRequest and the network status store"
```

---

### Task 6: `authApi` and `authStore` (TDD)

**Files:**
- Create: `apps/desktop/src/services/authApi.ts`
- Create: `apps/desktop/src/stores/authStore.ts`
- Create: `apps/desktop/src/stores/authStore.test.ts`

**Interfaces:**
- Consumes: `rawRequest`, `ApiError` (Task 5).
- Produces: `authApi.activateKey/login/refresh/logoutRequest/me/restoreSession`; `useAuthStore` with state `{ accessToken, refreshToken, user, sessionExpired }` and actions `setSession(accessToken, refreshToken, user)`, `setAccessToken(accessToken)`, `sessionExpiredNow()`, `clearSessionExpired()`, `logout(): Promise<void>` — consumed by Tasks 7-14.

- [ ] **Step 1: Implement `authApi.ts` (no dedicated test file — it's a thin pass-through over `rawRequest`, exercised through the hook/page tests in later tasks)**

`apps/desktop/src/services/authApi.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import { rawRequest } from "./apiClient";
import type { ActivateKeyInput, LoginInput, AuthResult, AuthUser, LicenseSummary } from "../types";

export function activateKey(input: ActivateKeyInput): Promise<AuthResult> {
  return rawRequest("/auth/activate-key", { method: "POST", body: input });
}

export function login(input: LoginInput): Promise<AuthResult> {
  return rawRequest("/auth/login", { method: "POST", body: input });
}

export function refresh(refreshToken: string): Promise<{ accessToken: string }> {
  return rawRequest("/auth/refresh", { method: "POST", body: { refreshToken } });
}

export function logoutRequest(refreshToken: string): Promise<void> {
  return rawRequest("/auth/logout", { method: "POST", body: { refreshToken } });
}

export function me(accessToken: string): Promise<{ user: AuthUser; license: LicenseSummary | null }> {
  return rawRequest("/auth/me", { token: accessToken });
}

export async function restoreSession(): Promise<AuthResult | null> {
  const storedRefreshToken = await invoke<string | null>("load_session");
  if (!storedRefreshToken) return null;

  try {
    const { accessToken } = await refresh(storedRefreshToken);
    const { user } = await me(accessToken);
    return { accessToken, refreshToken: storedRefreshToken, user };
  } catch {
    await invoke("clear_session");
    return null;
  }
}
```

- [ ] **Step 2: Write the failing tests for `authStore`**

`apps/desktop/src/stores/authStore.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthStore } from "./authStore";

const invokeMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("../services/authApi", () => ({
  logoutRequest: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, sessionExpired: false });
  invokeMock.mockClear();
});

describe("authStore", () => {
  it("setSession stores the tokens and user, clearing any expired flag", () => {
    useAuthStore.setState({ sessionExpired: true });
    useAuthStore.getState().setSession("at", "rt", { id: "1", email: "a@a.com", role: "USER" });

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe("at");
    expect(state.refreshToken).toBe("rt");
    expect(state.user?.email).toBe("a@a.com");
    expect(state.sessionExpired).toBe(false);
  });

  it("setAccessToken updates only the access token", () => {
    useAuthStore.getState().setSession("at", "rt", { id: "1", email: "a@a.com", role: "USER" });
    useAuthStore.getState().setAccessToken("new-at");

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe("new-at");
    expect(state.refreshToken).toBe("rt");
  });

  it("sessionExpiredNow clears tokens/user, sets the flag, and clears the stored session", () => {
    useAuthStore.getState().setSession("at", "rt", { id: "1", email: "a@a.com", role: "USER" });
    useAuthStore.getState().sessionExpiredNow();

    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.sessionExpired).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("clear_session");
  });

  it("clearSessionExpired only clears the flag", () => {
    useAuthStore.setState({ sessionExpired: true });
    useAuthStore.getState().clearSessionExpired();
    expect(useAuthStore.getState().sessionExpired).toBe(false);
  });

  it("logout clears local state and the stored session", async () => {
    useAuthStore.getState().setSession("at", "rt", { id: "1", email: "a@a.com", role: "USER" });
    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("clear_session");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './authStore'`.

- [ ] **Step 4: Implement `authStore.ts`**

`apps/desktop/src/stores/authStore.ts`:

```ts
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { logoutRequest } from "../services/authApi";
import type { AuthUser } from "../types";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  sessionExpired: boolean;
  setSession: (accessToken: string, refreshToken: string, user: AuthUser) => void;
  setAccessToken: (accessToken: string) => void;
  sessionExpiredNow: () => void;
  clearSessionExpired: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  sessionExpired: false,

  setSession: (accessToken, refreshToken, user) => {
    set({ accessToken, refreshToken, user, sessionExpired: false });
  },

  setAccessToken: (accessToken) => set({ accessToken }),

  sessionExpiredNow: () => {
    set({ accessToken: null, refreshToken: null, user: null, sessionExpired: true });
    void invoke("clear_session");
  },

  clearSessionExpired: () => set({ sessionExpired: false }),

  logout: async () => {
    const { refreshToken } = get();
    if (refreshToken) {
      try {
        await logoutRequest(refreshToken);
      } catch {
        // best-effort — proceed to clear local state regardless
      }
    }
    await invoke("clear_session");
    set({ accessToken: null, refreshToken: null, user: null, sessionExpired: false });
  },
}));
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS (all previous + 5 new tests).

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): add authApi and the authStore Zustand store"
```

---

### Task 7: `authedRequest` — auto-refresh on 401 (TDD)

**Files:**
- Create: `apps/desktop/src/services/authedRequest.ts`
- Create: `apps/desktop/src/services/authedRequest.test.ts`

**Interfaces:**
- Consumes: `rawRequest`, `ApiError` (Task 5); `useAuthStore` (Task 6).
- Produces: `authedRequest<T>(path: string, options?: { method?: string; body?: unknown }): Promise<T>` — consumed by Tasks 11 (`streamersApi`), 13 (`SettingsPage`), 14 (`adminApi`).

- [ ] **Step 1: Write the failing tests**

`apps/desktop/src/services/authedRequest.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { authedRequest } from "./authedRequest";
import { useAuthStore } from "../stores/authStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));

beforeEach(() => {
  useAuthStore.setState({
    accessToken: "old-token",
    refreshToken: "refresh-token",
    user: { id: "u1", email: "a@a.com", role: "USER" },
    sessionExpired: false,
  });
  vi.restoreAllMocks();
});

describe("authedRequest", () => {
  it("attaches the current access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await authedRequest("/streamers");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer old-token" }) })
    );
  });

  it("refreshes the access token and retries once on a 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "invalid_token", message: "x" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ accessToken: "new-token" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await authedRequest("/streamers");

    expect(result).toEqual({ items: [] });
    expect(useAuthStore.getState().accessToken).toBe("new-token");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("ends the session when the refresh attempt also fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "invalid_token", message: "x" }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "invalid_refresh_token", message: "y" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(authedRequest("/streamers")).rejects.toBeTruthy();
    expect(useAuthStore.getState().sessionExpired).toBe(true);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("ends the session on a 403 license_expired without attempting a refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "license_expired", message: "Licença expirada" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(authedRequest("/streamers")).rejects.toMatchObject({ code: "license_expired" });
    expect(useAuthStore.getState().sessionExpired).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not end the session on a 403 forbidden (a role check, not a license problem)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "forbidden", message: "Acesso restrito" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(authedRequest("/admin/keys")).rejects.toMatchObject({ code: "forbidden" });
    expect(useAuthStore.getState().sessionExpired).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './authedRequest'`.

- [ ] **Step 3: Implement `authedRequest.ts`**

`apps/desktop/src/services/authedRequest.ts`:

```ts
import { rawRequest, ApiError, type RequestOptions } from "./apiClient";
import { useAuthStore } from "../stores/authStore";

const SESSION_ENDING_CODES = new Set([
  "license_expired",
  "no_active_license",
  "invalid_token",
  "missing_token",
]);

export async function authedRequest<T>(
  path: string,
  options: Omit<RequestOptions, "token"> = {}
): Promise<T> {
  const store = useAuthStore.getState();

  try {
    return await rawRequest<T>(path, { ...options, token: store.accessToken ?? undefined });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && store.refreshToken) {
      try {
        const refreshed = await rawRequest<{ accessToken: string }>("/auth/refresh", {
          method: "POST",
          body: { refreshToken: store.refreshToken },
        });
        store.setAccessToken(refreshed.accessToken);
        return await rawRequest<T>(path, { ...options, token: refreshed.accessToken });
      } catch {
        store.sessionExpiredNow();
        throw err;
      }
    }

    if (err instanceof ApiError && SESSION_ENDING_CODES.has(err.code)) {
      store.sessionExpiredNow();
    }

    throw err;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS (all previous + 5 new tests).

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): add authedRequest with automatic 401 refresh-and-retry"
```

---

### Task 8: `useAuth` hook (TDD)

**Files:**
- Create: `apps/desktop/src/hooks/useAuth.ts`
- Create: `apps/desktop/src/hooks/useAuth.test.ts`

**Interfaces:**
- Consumes: `authApi.activateKey/login` (Task 6), `useAuthStore` (Task 6), `invoke` (Tauri).
- Produces: `useAuth(): { isAuthenticated, user, sessionExpired, activate(code, email, password), login(email, password), logout() }` — consumed by Tasks 9 (`LoginPage`), 13 (`SettingsPage`).

- [ ] **Step 1: Write the failing tests**

`apps/desktop/src/hooks/useAuth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "./useAuth";
import { useAuthStore } from "../stores/authStore";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

vi.mock("../services/authApi", async () => {
  const actual = await vi.importActual<typeof import("../services/authApi")>("../services/authApi");
  return {
    ...actual,
    activateKey: vi.fn(),
    login: vi.fn(),
  };
});

import * as authApi from "../services/authApi";

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, sessionExpired: false });
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
});

describe("useAuth", () => {
  it("activate() gets the hwid, calls activateKey, saves the session, and updates the store", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_hwid") return Promise.resolve("hwid-123");
      return Promise.resolve(undefined);
    });
    vi.mocked(authApi.activateKey).mockResolvedValue({
      accessToken: "at",
      refreshToken: "rt",
      user: { id: "1", email: "a@a.com", role: "USER" },
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.activate("LLZ-AAAA-BBBB-CCCC", "a@a.com", "pw123456");
    });

    expect(authApi.activateKey).toHaveBeenCalledWith({
      code: "LLZ-AAAA-BBBB-CCCC",
      email: "a@a.com",
      password: "pw123456",
      hwid: "hwid-123",
    });
    expect(invokeMock).toHaveBeenCalledWith("save_session", { refreshToken: "rt" });
    expect(useAuthStore.getState().accessToken).toBe("at");
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("login() calls login, saves the session, and updates the store", async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: "at2",
      refreshToken: "rt2",
      user: { id: "1", email: "a@a.com", role: "USER" },
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login("a@a.com", "pw123456");
    });

    expect(authApi.login).toHaveBeenCalledWith({ email: "a@a.com", password: "pw123456" });
    expect(invokeMock).toHaveBeenCalledWith("save_session", { refreshToken: "rt2" });
    expect(useAuthStore.getState().accessToken).toBe("at2");
  });

  it("isAuthenticated reflects whether an access token is present", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './useAuth'`.

- [ ] **Step 3: Implement `useAuth.ts`**

`apps/desktop/src/hooks/useAuth.ts`:

```ts
import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAuthStore } from "../stores/authStore";
import * as authApi from "../services/authApi";

export function useAuth() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const sessionExpired = useAuthStore((state) => state.sessionExpired);
  const setSession = useAuthStore((state) => state.setSession);
  const logoutStore = useAuthStore((state) => state.logout);

  const activate = useCallback(
    async (code: string, email: string, password: string) => {
      const hwid = await invoke<string>("get_hwid");
      const result = await authApi.activateKey({ code, email, password, hwid });
      await invoke("save_session", { refreshToken: result.refreshToken });
      setSession(result.accessToken, result.refreshToken, result.user);
    },
    [setSession]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authApi.login({ email, password });
      await invoke("save_session", { refreshToken: result.refreshToken });
      setSession(result.accessToken, result.refreshToken, result.user);
    },
    [setSession]
  );

  return {
    isAuthenticated: !!accessToken,
    user,
    sessionExpired,
    activate,
    login,
    logout: logoutStore,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS (all previous + 3 new tests).

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): add useAuth hook orchestrating activation, login, and session save"
```

---

### Task 9: `LoginPage` (TDD)

**Files:**
- Create: `apps/desktop/src/pages/LoginPage.tsx`
- Create: `apps/desktop/src/pages/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 8), `ApiError` (Task 5).
- Produces: `LoginPage` component — consumed by Task 10 (`App.tsx`).

- [ ] **Step 1: Write the failing tests**

`apps/desktop/src/pages/LoginPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginPage } from "./LoginPage";
import { ApiError } from "../services/apiClient";

const activateMock = vi.fn();
const loginMock = vi.fn();

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ activate: activateMock, login: loginMock }),
}));

beforeEach(() => {
  activateMock.mockReset();
  loginMock.mockReset();
});

describe("LoginPage", () => {
  it("activates a key with the entered code, email, and password", async () => {
    activateMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("LUC-XXXX-XXXX-XXXX"), "LLZ-AAAA-BBBB-CCCC");
    await user.type(screen.getByPlaceholderText("Email"), "user@example.com");
    await user.type(screen.getByPlaceholderText("Senha"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "Ativar acesso" }));

    await waitFor(() => {
      expect(activateMock).toHaveBeenCalledWith("LLZ-AAAA-BBBB-CCCC", "user@example.com", "supersecret123");
    });
  });

  it("switches to login mode and calls login instead of activate", async () => {
    loginMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Já tenho conta" }));
    await user.type(screen.getByPlaceholderText("Email"), "user@example.com");
    await user.type(screen.getByPlaceholderText("Senha"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith("user@example.com", "supersecret123");
    });
  });

  it("shows the server's error message when activation fails", async () => {
    activateMock.mockRejectedValue(new ApiError(403, "key_revoked", "Key revogada"));
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("LUC-XXXX-XXXX-XXXX"), "LLZ-AAAA-BBBB-CCCC");
    await user.type(screen.getByPlaceholderText("Email"), "user@example.com");
    await user.type(screen.getByPlaceholderText("Senha"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "Ativar acesso" }));

    expect(await screen.findByText("Key revogada")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './LoginPage'`.

- [ ] **Step 3: Implement `LoginPage.tsx`**

`apps/desktop/src/pages/LoginPage.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useAuth } from "../hooks/useAuth";
import { ApiError } from "../services/apiClient";

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
      <h1>LLZ CLIPPER</h1>
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
        <button type="submit" disabled={loading}>
          {loading ? "Aguarde…" : mode === "activate" ? "Ativar acesso" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS (all previous + 3 new tests).

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): add LoginPage with activate/login toggle"
```

---

### Task 10: Sidebar, `ComingSoonPage`, and the routed `App` shell (TDD)

**Files:**
- Create: `apps/desktop/src/components/Sidebar.tsx`
- Create: `apps/desktop/src/components/Sidebar.test.tsx`
- Create: `apps/desktop/src/pages/ComingSoonPage.tsx`
- Create: `apps/desktop/src/pages/StreamersPage.tsx` (temporary placeholder — replaced for real in Task 12)
- Create: `apps/desktop/src/pages/SettingsPage.tsx` (temporary placeholder — replaced for real in Task 13)
- Create: `apps/desktop/src/pages/AdminPage.tsx` (temporary placeholder — replaced for real in Task 14)
- Create: `apps/desktop/src/components/OfflineBanner.tsx`
- Create: `apps/desktop/src/components/SessionExpiredModal.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/App.test.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (Task 6), `useNetworkStore` (Task 5), `authApi.restoreSession` (Task 6), `LoginPage` (Task 9).
- Produces: the routed shell — `/vod`, `/clips`, `/editor` (`ComingSoonPage`), `/streamers`, `/settings`, `/admin` (role-gated), rendered inside `AppShell` once `accessToken` is set.

- [ ] **Step 1: Write `ComingSoonPage` and the temporary page placeholders (no tests — trivial, exercised by `App.test.tsx`)**

`apps/desktop/src/pages/ComingSoonPage.tsx`:

```tsx
interface ComingSoonPageProps {
  title: string;
}

export function ComingSoonPage({ title }: ComingSoonPageProps) {
  return (
    <div className="coming-soon">
      <h1>{title}</h1>
      <p>Essa funcionalidade chega em uma próxima fase do LLZ CLIPPER.</p>
    </div>
  );
}
```

`apps/desktop/src/pages/StreamersPage.tsx` (temporary):

```tsx
export function StreamersPage() {
  return <h1>Streamers</h1>;
}
```

`apps/desktop/src/pages/SettingsPage.tsx` (temporary):

```tsx
export function SettingsPage() {
  return <h1>Configurações</h1>;
}
```

`apps/desktop/src/pages/AdminPage.tsx` (temporary):

```tsx
export function AdminPage() {
  return <h1>Admin</h1>;
}
```

- [ ] **Step 2: Write the failing `Sidebar` tests**

`apps/desktop/src/components/Sidebar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useAuthStore } from "../stores/authStore";

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, sessionExpired: false });
});

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>
  );
}

describe("Sidebar", () => {
  it("shows the core navigation items", () => {
    renderSidebar();
    expect(screen.getByText("STREAMERS")).toBeInTheDocument();
    expect(screen.getByText("CONFIGURAÇÕES")).toBeInTheDocument();
    expect(screen.getByText("VOD")).toBeInTheDocument();
  });

  it("hides the ADMIN link for a regular user", () => {
    useAuthStore.setState({ user: { id: "1", email: "a@a.com", role: "USER" } });
    renderSidebar();
    expect(screen.queryByText("ADMIN")).not.toBeInTheDocument();
  });

  it("shows the ADMIN link for an admin user", () => {
    useAuthStore.setState({ user: { id: "1", email: "a@a.com", role: "ADMIN" } });
    renderSidebar();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './Sidebar'`.

- [ ] **Step 4: Implement `Sidebar.tsx`**

`apps/desktop/src/components/Sidebar.tsx`:

```tsx
import { NavLink } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

const NAV_ITEMS = [
  { to: "/vod", label: "VOD", icon: "🎥" },
  { to: "/clips", label: "CLIPS", icon: "🔥" },
  { to: "/editor", label: "EDITOR", icon: "🎬" },
  { to: "/streamers", label: "STREAMERS", icon: "👤" },
  { to: "/settings", label: "CONFIGURAÇÕES", icon: "⚙️" },
];

export function Sidebar() {
  const role = useAuthStore((state) => state.user?.role);

  return (
    <nav className="sidebar">
      <div className="sidebar-title">LLZ CLIPPER</div>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
        >
          <span>{item.icon}</span> {item.label}
        </NavLink>
      ))}
      {role === "ADMIN" && (
        <NavLink to="/admin" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
          <span>🛠</span> ADMIN
        </NavLink>
      )}
    </nav>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS (all previous + 3 new tests).

- [ ] **Step 6: Write `OfflineBanner` and `SessionExpiredModal` (no dedicated tests — trivial, exercised through `App.test.tsx`)**

`apps/desktop/src/components/OfflineBanner.tsx`:

```tsx
import { useNetworkStore } from "../stores/networkStore";

export function OfflineBanner() {
  const offline = useNetworkStore((state) => state.offline);
  if (!offline) return null;
  return <div className="offline-banner">Servidor indisponível — tentando reconectar</div>;
}
```

`apps/desktop/src/components/SessionExpiredModal.tsx`:

```tsx
import { useAuthStore } from "../stores/authStore";

export function SessionExpiredModal() {
  const clearSessionExpired = useAuthStore((state) => state.clearSessionExpired);

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Sua sessão expirou</h2>
        <button onClick={clearSessionExpired}>Voltar ao login</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write the failing `App` tests**

`apps/desktop/src/App.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { useAuthStore } from "./stores/authStore";

vi.mock("./services/authApi", () => ({
  restoreSession: vi.fn().mockResolvedValue(null),
}));

import { restoreSession } from "./services/authApi";

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, sessionExpired: false });
  window.location.hash = "";
  vi.mocked(restoreSession).mockResolvedValue(null);
});

describe("App", () => {
  it("shows the login page when there is no restored session", async () => {
    render(<App />);
    expect(await screen.findByPlaceholderText("Email")).toBeInTheDocument();
  });

  it("shows the sidebar once a session is restored", async () => {
    vi.mocked(restoreSession).mockResolvedValue({
      accessToken: "at",
      refreshToken: "rt",
      user: { id: "1", email: "a@a.com", role: "USER" },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("STREAMERS")).toBeInTheDocument();
    });
  });

  it("redirects a non-admin away from /admin to /streamers", async () => {
    vi.mocked(restoreSession).mockResolvedValue({
      accessToken: "at",
      refreshToken: "rt",
      user: { id: "1", email: "a@a.com", role: "USER" },
    });
    window.location.hash = "#/admin";

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Streamers")).toBeInTheDocument();
    });
  });

  it("shows the SessionExpiredModal when the store flags an expired session", async () => {
    vi.mocked(restoreSession).mockResolvedValue({
      accessToken: "at",
      refreshToken: "rt",
      user: { id: "1", email: "a@a.com", role: "USER" },
    });

    render(<App />);
    await waitFor(() => expect(screen.getByText("STREAMERS")).toBeInTheDocument());

    useAuthStore.getState().sessionExpiredNow();

    expect(await screen.findByText("Sua sessão expirou")).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run to verify it fails**

Run: `npm test -w @llz-clipper/desktop`
Expected: FAIL — the placeholder `App.tsx` from Task 2 doesn't route or authenticate anything.

- [ ] **Step 9: Implement the routed `App.tsx`**

Replace `apps/desktop/src/App.tsx`:

```tsx
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
import { ComingSoonPage } from "./pages/ComingSoonPage";

function AppShell() {
  const role = useAuthStore((state) => state.user?.role);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
        <Routes>
          <Route path="/vod" element={<ComingSoonPage title="VOD" />} />
          <Route path="/clips" element={<ComingSoonPage title="Clips" />} />
          <Route path="/editor" element={<ComingSoonPage title="Editor" />} />
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
```

- [ ] **Step 10: Run to verify it passes**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS (all previous + 4 new tests).

- [ ] **Step 11: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): add Sidebar, routed App shell, offline banner, and session-expired modal"
```

---

### Task 11: `useStreamers` hook and `streamersApi` (TDD)

**Files:**
- Create: `apps/desktop/src/services/streamersApi.ts`
- Create: `apps/desktop/src/hooks/useStreamers.ts`
- Create: `apps/desktop/src/hooks/useStreamers.test.ts`

**Interfaces:**
- Consumes: `authedRequest` (Task 7).
- Produces: `streamersApi.{listStreamers, createStreamer, updateStreamer, deleteStreamer}`, `StreamerInput`; `useStreamers(): { streamers, loading, create(input), update(id, input), remove(id) }` — consumed by Task 12 (`StreamersPage`).

- [ ] **Step 1: Implement `streamersApi.ts` (no dedicated test file — exercised through `useStreamers.test.ts` and `StreamersPage.test.tsx`)**

`apps/desktop/src/services/streamersApi.ts`:

```ts
import { authedRequest } from "./authedRequest";
import type { Streamer } from "../types";

export interface StreamerInput {
  name: string;
  username: string;
  logoUrl?: string;
  presetId?: string;
}

export function listStreamers(): Promise<Streamer[]> {
  return authedRequest("/streamers");
}

export function createStreamer(input: StreamerInput): Promise<Streamer> {
  return authedRequest("/streamers", { method: "POST", body: input });
}

export function updateStreamer(id: string, input: Partial<StreamerInput>): Promise<Streamer> {
  return authedRequest(`/streamers/${id}`, { method: "PUT", body: input });
}

export function deleteStreamer(id: string): Promise<void> {
  return authedRequest(`/streamers/${id}`, { method: "DELETE" });
}
```

- [ ] **Step 2: Write the failing tests for `useStreamers`**

`apps/desktop/src/hooks/useStreamers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useStreamers } from "./useStreamers";
import * as streamersApi from "../services/streamersApi";

vi.mock("../services/streamersApi");

const sampleStreamer = {
  id: "s1",
  name: "DiParis7k",
  username: "diparis7k",
  logoUrl: null,
  watermark: null,
  presetId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(streamersApi.listStreamers).mockResolvedValue([sampleStreamer]);
  vi.mocked(streamersApi.createStreamer).mockResolvedValue({ ...sampleStreamer, id: "s2" });
  vi.mocked(streamersApi.updateStreamer).mockResolvedValue({ ...sampleStreamer, name: "Editado" });
  vi.mocked(streamersApi.deleteStreamer).mockResolvedValue(undefined);
});

describe("useStreamers", () => {
  it("loads streamers on mount", async () => {
    const { result } = renderHook(() => useStreamers());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.streamers).toEqual([sampleStreamer]);
  });

  it("create() calls the API and reloads the list", async () => {
    const { result } = renderHook(() => useStreamers());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.create({ name: "Novo", username: "novo" });
    });

    expect(streamersApi.createStreamer).toHaveBeenCalledWith({ name: "Novo", username: "novo" });
    expect(streamersApi.listStreamers).toHaveBeenCalledTimes(2);
  });

  it("remove() calls the API and reloads the list", async () => {
    const { result } = renderHook(() => useStreamers());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove("s1");
    });

    expect(streamersApi.deleteStreamer).toHaveBeenCalledWith("s1");
    expect(streamersApi.listStreamers).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './useStreamers'`.

- [ ] **Step 4: Implement `useStreamers.ts`**

`apps/desktop/src/hooks/useStreamers.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import * as streamersApi from "../services/streamersApi";
import type { StreamerInput } from "../services/streamersApi";
import type { Streamer } from "../types";

export function useStreamers() {
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const data = await streamersApi.listStreamers();
    setStreamers(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (input: StreamerInput) => {
      await streamersApi.createStreamer(input);
      await reload();
    },
    [reload]
  );

  const update = useCallback(
    async (id: string, input: Partial<StreamerInput>) => {
      await streamersApi.updateStreamer(id, input);
      await reload();
    },
    [reload]
  );

  const remove = useCallback(
    async (id: string) => {
      await streamersApi.deleteStreamer(id);
      await reload();
    },
    [reload]
  );

  return { streamers, loading, create, update, remove };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS (all previous + 3 new tests).

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): add streamersApi and the useStreamers hook"
```

---

### Task 12: `StreamerForm` and the real `StreamersPage` (TDD)

**Files:**
- Create: `apps/desktop/src/components/StreamerForm.tsx`
- Modify: `apps/desktop/src/pages/StreamersPage.tsx` (replacing the Task 10 placeholder)
- Create: `apps/desktop/src/pages/StreamersPage.test.tsx`

**Interfaces:**
- Consumes: `useStreamers` (Task 11).
- Produces: the real Streamers screen — consumed by nothing further (leaf page).

- [ ] **Step 1: Write the failing tests**

`apps/desktop/src/pages/StreamersPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StreamersPage } from "./StreamersPage";
import * as streamersApi from "../services/streamersApi";

vi.mock("../services/streamersApi");

const sampleStreamer = {
  id: "s1",
  name: "DiParis7k",
  username: "diparis7k",
  logoUrl: null,
  watermark: null,
  presetId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(streamersApi.listStreamers).mockResolvedValue([sampleStreamer]);
  vi.mocked(streamersApi.createStreamer).mockResolvedValue({ ...sampleStreamer, id: "s2", name: "Novo" });
  vi.mocked(streamersApi.updateStreamer).mockResolvedValue({ ...sampleStreamer, name: "Nome Editado" });
  vi.mocked(streamersApi.deleteStreamer).mockResolvedValue(undefined);
});

describe("StreamersPage", () => {
  it("lists streamers fetched from the API", async () => {
    render(<StreamersPage />);
    expect(await screen.findByText("DiParis7k")).toBeInTheDocument();
  });

  it("creates a new streamer through the form", async () => {
    const user = userEvent.setup();
    render(<StreamersPage />);
    await screen.findByText("DiParis7k");

    await user.click(screen.getByRole("button", { name: "+ Novo Streamer" }));
    await user.type(screen.getByPlaceholderText("Nome"), "Novo");
    await user.type(screen.getByPlaceholderText("Username"), "novo");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(streamersApi.createStreamer).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Novo", username: "novo" })
      );
    });
  });

  it("edits an existing streamer", async () => {
    const user = userEvent.setup();
    render(<StreamersPage />);
    await screen.findByText("DiParis7k");

    await user.click(screen.getByRole("button", { name: "Editar" }));
    const nameInput = screen.getByPlaceholderText("Nome") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Nome Editado");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(streamersApi.updateStreamer).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({ name: "Nome Editado" })
      );
    });
  });

  it("deletes a streamer", async () => {
    const user = userEvent.setup();
    render(<StreamersPage />);
    await screen.findByText("DiParis7k");

    await user.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => {
      expect(streamersApi.deleteStreamer).toHaveBeenCalledWith("s1");
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @llz-clipper/desktop`
Expected: FAIL — the Task 10 placeholder `StreamersPage` renders only an `<h1>`, none of the buttons/inputs exist.

- [ ] **Step 3: Implement `StreamerForm.tsx`**

`apps/desktop/src/components/StreamerForm.tsx`:

```tsx
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
```

- [ ] **Step 4: Implement the real `StreamersPage.tsx`**

Replace `apps/desktop/src/pages/StreamersPage.tsx`:

```tsx
import { useState } from "react";
import { useStreamers } from "../hooks/useStreamers";
import { StreamerForm } from "../components/StreamerForm";
import type { Streamer } from "../types";
import type { StreamerInput } from "../services/streamersApi";

export function StreamersPage() {
  const { streamers, loading, create, update, remove } = useStreamers();
  const [editing, setEditing] = useState<Streamer | null>(null);
  const [showForm, setShowForm] = useState(false);

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

  return (
    <div className="streamers-page">
      <div className="page-header">
        <h1>Streamers</h1>
        <button onClick={openCreate}>+ Novo Streamer</button>
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
              <button onClick={() => void remove(streamer.id)}>Excluir</button>
            </div>
          ))}
        </div>
      )}
      {showForm && <StreamerForm streamer={editing} onSave={handleSave} onCancel={() => setShowForm(false)} />}
    </div>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS (all previous + 4 new tests).

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): implement the Streamers screen (list, create, edit, delete)"
```

---

### Task 13: The real `SettingsPage` (TDD)

**Files:**
- Modify: `apps/desktop/src/pages/SettingsPage.tsx` (replacing the Task 10 placeholder)
- Create: `apps/desktop/src/pages/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `authedRequest` (Task 7), `useAuth` (Task 8).
- Produces: the real Settings screen (leaf page).

- [ ] **Step 1: Write the failing tests**

`apps/desktop/src/pages/SettingsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "./SettingsPage";
import { authedRequest } from "../services/authedRequest";

vi.mock("../services/authedRequest", () => ({ authedRequest: vi.fn() }));

const logoutMock = vi.fn();
vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ logout: logoutMock }),
}));

beforeEach(() => {
  logoutMock.mockReset();
  vi.mocked(authedRequest).mockResolvedValue({
    user: { id: "1", email: "user@example.com", role: "USER" },
    license: {
      plan: "MONTHLY",
      status: "ACTIVE",
      activatedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-31T00:00:00.000Z",
      hwid: "hwid-abc",
    },
  });
});

describe("SettingsPage", () => {
  it("shows the account email, plan, and license status", async () => {
    render(<SettingsPage />);
    expect(await screen.findByText(/user@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/MONTHLY/)).toBeInTheDocument();
    expect(screen.getByText(/ACTIVE/)).toBeInTheDocument();
  });

  it("calls logout when the Sair button is clicked", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText(/user@example\.com/);

    await user.click(screen.getByRole("button", { name: "Sair" }));

    expect(logoutMock).toHaveBeenCalled();
  });

  it("shows a placeholder for the other tabs", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByText(/user@example\.com/);

    await user.click(screen.getByRole("button", { name: "Geral" }));

    expect(screen.getByText("Em breve.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @llz-clipper/desktop`
Expected: FAIL — the Task 10 placeholder renders only an `<h1>`.

- [ ] **Step 3: Implement the real `SettingsPage.tsx`**

Replace `apps/desktop/src/pages/SettingsPage.tsx`:

```tsx
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
    authedRequest<MeResponse>("/auth/me").then(setMe);
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS (all previous + 3 new tests).

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): implement the Settings screen's Conta tab"
```

---

### Task 14: `adminApi`, `KeyTable`, and the real `AdminPage` (TDD)

**Files:**
- Create: `apps/desktop/src/services/adminApi.ts`
- Create: `apps/desktop/src/components/KeyTable.tsx`
- Modify: `apps/desktop/src/pages/AdminPage.tsx` (replacing the Task 10 placeholder)
- Create: `apps/desktop/src/pages/AdminPage.test.tsx`

**Interfaces:**
- Consumes: `authedRequest` (Task 7).
- Produces: the real Admin screen (leaf page).

- [ ] **Step 1: Implement `adminApi.ts` (no dedicated test file — exercised through `AdminPage.test.tsx`)**

`apps/desktop/src/services/adminApi.ts`:

```ts
import { authedRequest } from "./authedRequest";
import type { LicenseKey, UsageLog, PaginatedResult, PlanType } from "../types";

export function createKey(plan: PlanType): Promise<LicenseKey> {
  return authedRequest("/admin/keys", { method: "POST", body: { plan } });
}

export function createKeysBulk(plan: PlanType, count: number): Promise<LicenseKey[]> {
  return authedRequest("/admin/keys/bulk", { method: "POST", body: { plan, count } });
}

export function listKeys(
  filters: { status?: string; plan?: string; search?: string; page?: number } = {}
): Promise<PaginatedResult<LicenseKey>> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.plan) params.set("plan", filters.plan);
  if (filters.search) params.set("search", filters.search);
  if (filters.page) params.set("page", String(filters.page));
  const query = params.toString();
  return authedRequest(`/admin/keys${query ? `?${query}` : ""}`);
}

export function revokeKey(id: string): Promise<LicenseKey> {
  return authedRequest(`/admin/keys/${id}/revoke`, { method: "POST" });
}

export function listLogs(page = 1): Promise<PaginatedResult<UsageLog>> {
  return authedRequest(`/admin/logs?page=${page}`);
}
```

- [ ] **Step 2: Implement `KeyTable.tsx` (no dedicated test file — exercised through `AdminPage.test.tsx`)**

`apps/desktop/src/components/KeyTable.tsx`:

```tsx
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
```

- [ ] **Step 3: Write the failing tests for `AdminPage`**

`apps/desktop/src/pages/AdminPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminPage } from "./AdminPage";
import * as adminApi from "../services/adminApi";

vi.mock("../services/adminApi");

const sampleKey = {
  id: "k1",
  code: "LLZ-AAAA-BBBB-CCCC",
  plan: "MONTHLY" as const,
  status: "UNUSED" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  activatedAt: null,
  expiresAt: null,
  revokedAt: null,
  userId: null,
};

beforeEach(() => {
  vi.mocked(adminApi.listKeys).mockResolvedValue({ items: [sampleKey], total: 1, page: 1, pageSize: 20 });
  vi.mocked(adminApi.createKey).mockResolvedValue(sampleKey);
  vi.mocked(adminApi.createKeysBulk).mockResolvedValue([sampleKey, sampleKey]);
  vi.mocked(adminApi.revokeKey).mockResolvedValue({ ...sampleKey, status: "REVOKED" });
});

describe("AdminPage", () => {
  it("lists keys from the API", async () => {
    render(<AdminPage />);
    expect(await screen.findByText("LLZ-AAAA-BBBB-CCCC")).toBeInTheDocument();
  });

  it("generates a single monthly key", async () => {
    const user = userEvent.setup();
    render(<AdminPage />);
    await screen.findByText("LLZ-AAAA-BBBB-CCCC");

    await user.click(screen.getByRole("button", { name: "Gerar Key (Mensal)" }));

    await waitFor(() => {
      expect(adminApi.createKey).toHaveBeenCalledWith("MONTHLY");
    });
  });

  it("generates 10 keys in bulk", async () => {
    const user = userEvent.setup();
    render(<AdminPage />);
    await screen.findByText("LLZ-AAAA-BBBB-CCCC");

    await user.click(screen.getByRole("button", { name: "Gerar 10 Keys" }));

    await waitFor(() => {
      expect(adminApi.createKeysBulk).toHaveBeenCalledWith("MONTHLY", 10);
    });
  });

  it("revokes a key", async () => {
    const user = userEvent.setup();
    render(<AdminPage />);
    await screen.findByText("LLZ-AAAA-BBBB-CCCC");

    await user.click(screen.getByRole("button", { name: "Revogar" }));

    await waitFor(() => {
      expect(adminApi.revokeKey).toHaveBeenCalledWith("k1");
    });
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm test -w @llz-clipper/desktop`
Expected: FAIL — the Task 10 placeholder renders only an `<h1>`.

- [ ] **Step 5: Implement the real `AdminPage.tsx`**

Replace `apps/desktop/src/pages/AdminPage.tsx`:

```tsx
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
    const result = await adminApi.listKeys({ status: statusFilter || undefined });
    setKeys(result.items);
    setLoading(false);
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
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS (all previous + 4 new tests).

- [ ] **Step 7: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): implement the Admin screen (generate, list, filter, revoke keys)"
```

---

### Task 15: Full verification, manual smoke test, and README update

**Files:**
- Modify: `README.md` (root)

**Interfaces:**
- Consumes: everything from Tasks 1-14.
- Produces: nothing new — final verification and documentation pass.

- [ ] **Step 1: Run the full test suite from the repo root**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test`
Expected: every workspace's tests pass, including `@llz-clipper/desktop`'s full suite alongside the Fase 1 workspaces.

- [ ] **Step 2: Run typecheck across all workspaces**

Run: `npm run typecheck`
Expected: exits 0 for every workspace, including `@llz-clipper/desktop`.

- [ ] **Step 3: Verify the Rust side still compiles cleanly**

Run: `cd apps/desktop/src-tauri && cargo check`
Expected: `Finished` with no errors or warnings introduced by this plan.

- [ ] **Step 4: Manual end-to-end smoke test**

With the Fase 1 API running (`npm run dev -w @llz-clipper/api` from the
repo root, in a separate terminal, `.env` pointing at the local
`llz_clipper` database), run:

```bash
npm run tauri dev -w @llz-clipper/desktop
```

Walk through, confirming each step works against the real API:
1. The window opens titled "LLZ CLIPPER", showing the login screen.
2. Generate a test key first via `curl` against a running admin session
   (see the README's "Gerando uma key de teste" section), or directly via
   `psql`/Prisma Studio against `llz_clipper` if no admin exists yet.
3. Activate the key in the app (code + email + password) → lands on the
   Streamers screen with the sidebar visible.
4. Create, edit, and delete a streamer — confirm each change persists
   (reflected immediately, and still there after closing/reopening the
   app, which exercises the Postgres-backed API, not local-only state).
5. Open Configurações → Conta tab shows the email, plan, license status,
   expiry, and device — click "Sair" and confirm it returns to the login
   screen.
6. Log back in with the same email/password (not re-activating) —
   confirms `POST /auth/login` and session restore both work.
7. Close and reopen the app (`npm run tauri dev` again) without logging
   out — confirms `load_session` + `POST /auth/refresh` silently restore
   the session and land directly on the Streamers screen.
8. If the test account is an admin (seeded via
   `npm run seed:admin -w @llz-clipper/api`), confirm the 🛠 ADMIN sidebar
   item appears, and that generating/revoking a key there works.
9. Stop the API process while the app is open, then try any action (e.g.
   reload Streamers) — confirm the `OfflineBanner` appears instead of a
   silent failure or infinite spinner. Restart the API and confirm the
   next successful request clears the banner.

- [ ] **Step 5: Update the root README**

Add this section to `README.md`, after the existing "Estrutura" section:

```markdown
## Rodando o app desktop (Fase 2)

Com a API rodando (`npm run dev -w @llz-clipper/api`):

```bash
npm run tauri dev -w @llz-clipper/desktop
```

Isso abre a janela do LLZ CLIPPER apontando para `http://localhost:3000`.
Gere uma key de teste (ver seção "Gerando uma key de teste" acima) e use a
tela de ativação para entrar.

Para gerar o instalador Windows (`LLZ-CLIPPER-Setup.exe`):

```bash
npm run tauri build -w @llz-clipper/desktop
```
```

Also update the "Estrutura" code block's `apps/desktop/` line from
`# Fase 2 — placeholder` to `# App Tauri + React (login, streamers,
configurações, admin)`, and add a line to "O que NÃO está implementado
nesta fase" section (rename it conceptually to reflect Fase 2 is now
partially done, by adding above the existing bullet list):

```markdown
**Fase 2 (Desktop Shell)** está implementada: login/ativação, sidebar,
Streamers, Configurações (aba Conta) e Admin, todos funcionais contra a
API real. `/vod`, `/clips`, `/editor` são placeholders "em breve" — seu
backend ainda não existe (Fases 3-5).
```

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add README.md
git commit -m "docs: document running and building the Fase 2 desktop app"
```

---

## Self-Review

**Spec coverage:**
- Stack/estrutura de pastas → Task 2 ✅
- HWID via Rust/registry → Task 3 ✅ (verified readable without elevation during planning)
- Refresh token via Windows Credential Manager (`keyring`) → Task 4 ✅ (verified `Entry`/`set_password`/`get_password`/`delete_credential` API against the actual installed crate source)
- Fluxo de abertura do app (load_session → refresh → /me) → Task 6 (`restoreSession`) + Task 10 (`App.tsx` bootstrap) ✅
- Tela de login/ativação com toggle → Task 9 ✅
- Renovação automática de access token em 401 → Task 7 ✅
- Sidebar com todos os itens, ADMIN condicional → Task 10 ✅
- Streamers CRUD completo → Tasks 11-12 ✅
- Configurações (aba Conta funcional, outras placeholder) → Task 13 ✅ (required extending `GET /auth/me` — Task 1, an honest gap found while planning, not silently dropped)
- Admin (gerar/bulk/listar/revogar keys) → Task 14 ✅ (logs endpoint `adminApi.listLogs` implemented but not wired into a UI tab in this plan — the spec's Admin section only explicitly required the keys table as the Fase 2 deliverable; a logs tab is easy to add later without changing this plan's architecture)
- Placeholders "em breve" para VOD/Clips/Editor → Task 10 ✅
- Redirecionamento de `/admin` para não-admin → Task 10 ✅
- OfflineBanner / SessionExpiredModal → Task 10 ✅
- Estilo (design tokens, paleta) → Task 2 ✅
- Testes Vitest + RTL cobrindo login/refresh/CRUD/admin/sidebar → Tasks 5-14 ✅
- `cargo check` como verificação Rust (sem testes automatizados) → Tasks 3, 4, 15 ✅
- Build via `npm run tauri build` → Task 15 (documented; not run automatically since it needs the icons already present, which are the scaffold's defaults — actual production branding icons are a future design-asset task, out of scope here)

**Gap found and resolved during planning:** the spec assumed `GET
/auth/me` already returned license/plan/expiry/device data; the actual
Fase 1 implementation only returns `{ user }`. Task 1 extends it with a
`license` field before the Settings screen (Task 13) needs it — this is
called out explicitly rather than silently shipping a Settings screen
that can't show what the spec described.

**Placeholder scan:** no TBD/TODO markers; every step has literal file
content and literal shell commands, verified against the actual installed
crate/package versions and APIs (Prisma-adjacent naming quirks from Fase 1
don't recur here; `keyring`/`winreg` APIs were read from the downloaded
crate sources, not assumed from memory).

**Type consistency:** `AuthResult`, `AuthUser`, `LicenseSummary`,
`Streamer`, `LicenseKey`, `UsageLog`, `PaginatedResult<T>` are defined once
in `src/types.ts` (Task 2) and reused identically through Task 14.
`authedRequest`'s signature (`Omit<RequestOptions, "token">`) matches
`apiClient.ts`'s exported `RequestOptions` type from Task 5. The
`sessionExpiredNow`/`clearSessionExpired`/`logout` action names introduced
in Task 6 are used identically in Tasks 7, 9, 10, and 13 without renaming.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-27-llz-clipper-fase2-desktop.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
