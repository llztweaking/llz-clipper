# LLZ CLIPPER — Redesign Visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the LLZ CLIPPER desktop app a complete visual design system (colors, typography, spacing, icons) built on a restrained "neon" identity, applied on top of the existing screen structure — no layout, navigation, or behavior changes.

**Architecture:** A CSS-only overhaul plus one icon-library swap. All new CSS lives in the existing single stylesheet, `apps/desktop/src/styles/global.css` (this codebase has never used per-component CSS files or CSS modules — one shared stylesheet is the established pattern, and this plan follows it rather than introducing a new one). `apps/desktop/src/styles/tokens.css` is fully rewritten with the new design tokens first, since every other task depends on those CSS custom properties existing. **A significant discovery from reading every affected file before writing this plan: most of the app's pages and components reference CSS classes (`.streamers-page`, `.admin-page`, `.vod-card`, `.clip-card`, `.editor-page`, dozens more) that have no corresponding CSS rule anywhere in the codebase today** — only buttons, inputs, the sidebar, modals, and the video-preview overlays (added in Fase 5A) are actually styled. Everything else renders as unstyled browser-default layout. This plan is therefore not a re-skin of existing styling — most pages get real CSS written for the first time, using the new tokens from the start. A leftover, unused Tauri/Vite scaffold file (`apps/desktop/src/App.css`, confirmed via grep to be imported nowhere) is deleted as part of Task 1.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, React Testing Library, `lucide-react` (new dependency, icons only).

**Spec:** `docs/superpowers/specs/2026-08-30-llz-clipper-visual-redesign-design.md`

## Global Constraints

- This is a **visual/CSS + icon-swap change only** — no layout changes, no navigation changes, no new routes, no behavior changes. The only non-CSS code edits in this whole plan are: replacing 6 emoji strings with icon components in `Sidebar.tsx`, and adding a `className="btn-primary"` (or `className="clip-status-rendering"`) prop to a small, explicitly enumerated list of existing JSX elements — never new elements, never new logic.
- No new dependencies besides `lucide-react`.
- **Dark theme only** — no light mode, no `prefers-color-scheme` handling.
- **All new CSS goes into the existing `apps/desktop/src/styles/global.css`** — this codebase has one shared stylesheet, not per-component CSS files; do not introduce a new pattern.
- **The "neon restricted to accent" rule** (from the spec's "Regra de aplicação"): `var(--accent-gradient)` and the `--glow-*` shadows appear **only** on: (1) a page's primary action button(s) — see each task's explicit list of which buttons qualify, this is enumerated precisely per page, never guessed; (2) the active sidebar link; (3) an in-progress `Job`/`Render` indicator (a `Job`/`Render` whose `status` is not `COMPLETED`/`FAILED`, i.e. any status that already causes the existing conditional-render logic to show a progress element); (4) a focused form input/textarea/select. Every other surface (cards at rest, secondary buttons, default text, table rows, borders) uses only the neutral tokens — no gradient, no glow. Errors use `--danger` alone (no glow). Success/completed states use `--success` alone (no glow).
- Exact token values (colors, sizes, weights, spacing, radii) are given verbatim in Task 1 — every later task must use `var(--token-name)`, never a hardcoded hex/px value duplicating what a token already covers.
- Out of scope (do not touch): light mode, any layout/navigation/flow change, branding/logo, marketing site, animations/transitions beyond ordinary CSS `:hover`/`:focus`, custom illustrations.

---

### Task 1: Design tokens + remove dead scaffold CSS

**Files:**
- Modify: `apps/desktop/src/styles/tokens.css` (full rewrite)
- Delete: `apps/desktop/src/App.css`

**Interfaces:**
- Produces: every CSS custom property used by every later task. This is the single source of truth for all color/typography/spacing/radius/glow values in this plan — no later task invents its own value for anything a token below already covers.

- [ ] **Step 1: Confirm `App.css` is genuinely unused**

Run: `grep -rn "App.css" apps/desktop/src` (or use your editor's search) — expect zero matches (the only place a CSS import happens is `apps/desktop/src/main.tsx`, which imports `./styles/global.css`, not `App.css`). This confirms `App.css` is a dead leftover from the original Tauri/Vite scaffold, safe to delete.

- [ ] **Step 2: Delete the dead file**

Delete `apps/desktop/src/App.css`.

- [ ] **Step 3: Replace `tokens.css`'s full content**

Replace all of `apps/desktop/src/styles/tokens.css` with:

```css
:root {
  /* Cores base */
  --bg: #0c0c10;
  --surface: #151519;
  --surface-raised: #1a1a20;
  --border: #232329;
  --border-accent: #5a2fa3;
  --text: #f2f2f5;
  --text-muted: #9a9aa4;

  /* Acento (gradiente de marca) */
  --accent-start: #ff2ec4;
  --accent-mid: #7c3bff;
  --accent-end: #3b8bff;
  --accent-gradient: linear-gradient(90deg, var(--accent-start), var(--accent-mid), var(--accent-end));

  /* Semântico */
  --danger: #ff4d6a;
  --success: #3ddc84;

  /* Glow (só em elementos de destaque — ver Global Constraints) */
  --glow-sm: 0 0 12px -2px rgba(255, 46, 196, 0.6);
  --glow-md: 0 0 24px -4px rgba(255, 46, 196, 0.55), 0 0 24px -4px rgba(59, 139, 255, 0.4);

  /* Tipografia */
  --font-size-xs: 12px;
  --font-size-sm: 13px;
  --font-size-base: 14px;
  --font-size-lg: 16px;
  --font-size-xl: 20px;
  --font-size-2xl: 28px;
  --font-weight-regular: 400;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --font-weight-extrabold: 800;

  /* Espaçamento (grade de 4px) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* Raios */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
}
```

- [ ] **Step 4: Verify the app still boots**

Run: `npm run typecheck -w @llz-clipper/desktop` (a CSS-only change plus a file deletion can't break TypeScript, but this confirms nothing imported `App.css` in a way grep missed — if it had, this step would fail with a module-not-found error).
Expected: clean, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/styles/tokens.css
git rm apps/desktop/src/App.css
git commit -m "feat(desktop): rewrite design tokens, remove dead scaffold CSS"
```

---

### Task 2: Shared global styles — buttons, inputs, sidebar, modals

**Files:**
- Modify: `apps/desktop/src/styles/global.css` (full rewrite of the file's current content — it will grow substantially across this plan, but this task only touches the rules that already exist today plus the new shared primitives every later task needs)
- Modify: `apps/desktop/src/components/SessionExpiredModal.tsx` (one className addition)

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: the `.btn-primary` class (used by every later page-task's primary-action buttons), the input/textarea/select `:focus` accent rule (applies globally, no later task needs to repeat it), and restyled `.sidebar-link.active`. Also produces `.app-loading` (used by `App.tsx`'s bootstrapping screen, currently unstyled).

- [ ] **Step 1: Read the current file first**

Read `apps/desktop/src/styles/global.css` in full (it may have grown since this plan was written — the video-preview rules added in Fase 5A must be preserved). Also re-read `apps/desktop/src/components/SessionExpiredModal.tsx`.

- [ ] **Step 2: Replace the file's content**

Replace `apps/desktop/src/styles/global.css`'s full content with:

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
  font-size: var(--font-size-base);
}

h1 {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-extrabold);
  letter-spacing: 0.3px;
  margin: 0 0 var(--space-4);
}

h2 {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  margin: 0 0 var(--space-3);
}

h3 {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  margin: 0 0 var(--space-2);
}

button {
  cursor: pointer;
  background: var(--surface-raised);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

button:hover:not(:disabled) {
  border-color: var(--border-accent);
}

button:disabled {
  opacity: 0.6;
  cursor: default;
}

.btn-primary {
  background: var(--accent-gradient);
  color: white;
  border: none;
  box-shadow: var(--glow-sm);
}

.btn-primary:hover:not(:disabled) {
  box-shadow: var(--glow-md);
}

input,
textarea,
select {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-base);
  font-family: inherit;
}

input:focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: var(--accent-mid);
  box-shadow: var(--glow-sm);
}

.app-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: var(--text-muted);
  font-size: var(--font-size-lg);
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
  padding: var(--space-4) var(--space-2);
}

.sidebar-title {
  font-weight: var(--font-weight-extrabold);
  font-size: var(--font-size-lg);
  padding: var(--space-2) var(--space-3) var(--space-5);
  letter-spacing: 0.3px;
}

.sidebar-link {
  color: var(--text-muted);
  text-decoration: none;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--space-1);
}

.sidebar-link:hover {
  color: var(--text);
}

.sidebar-link.active {
  background: var(--accent-gradient);
  color: white;
  box-shadow: var(--glow-sm);
}

.app-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
}

.offline-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: var(--danger);
  color: white;
  text-align: center;
  padding: var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
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
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  min-width: 320px;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.form-error {
  color: var(--danger);
  font-size: var(--font-size-sm);
}

.video-preview {
  position: relative;
  display: inline-block;
}

.video-preview video {
  display: block;
  max-width: 100%;
}

.video-preview-caption {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 14px;
  border-radius: 4px;
  white-space: nowrap;
}

.video-preview-watermark {
  position: absolute;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  font-size: 12px;
  border-radius: 4px;
}

.video-preview-watermark-top-left {
  top: 12px;
  left: 12px;
}

.video-preview-watermark-top-right {
  top: 12px;
  right: 12px;
}

.video-preview-watermark-bottom-left {
  bottom: 12px;
  left: 12px;
}

.video-preview-watermark-bottom-right {
  bottom: 12px;
  right: 12px;
}
```

(The `.video-preview*` rules at the end are unchanged from Fase 5A — carried forward verbatim, not modified by this task. The `--accent` single-color token from before this plan no longer exists; nothing above references it — if your read of the current file in Step 1 shows any other rule still referencing bare `--accent`, replace it with `--accent-gradient` or `--accent-mid` as appropriate to that rule's purpose, following the pattern above.)

- [ ] **Step 3: Mark `SessionExpiredModal`'s button as primary**

`SessionExpiredModal.tsx` is a full-screen interrupt with exactly one button — the sole way forward for the user, the same category as `LoginPage`'s submit button. Change:

```tsx
        <button onClick={clearSessionExpired}>Voltar ao login</button>
```

to:

```tsx
        <button className="btn-primary" onClick={clearSessionExpired}>Voltar ao login</button>
```

- [ ] **Step 4: Run the full desktop test suite**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS, same count as before this task (this is a pure CSS change plus one className addition — no test asserts on computed styles or class names today, so nothing should newly fail; if something does fail, it means a test was asserting on the literal string `"var(--accent)"` or similar — read that test and fix the assertion to match the new token name, don't revert the CSS).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/styles/global.css apps/desktop/src/components/SessionExpiredModal.tsx
git commit -m "feat(desktop): restyle shared button/input/sidebar/modal primitives"
```

---

### Task 3: Sidebar icons

**Files:**
- Modify: `apps/desktop/src/components/Sidebar.tsx`
- Modify: `apps/desktop/src/components/Sidebar.test.tsx`
- Modify: `apps/desktop/package.json` (new dependency)

**Interfaces:**
- Consumes: `.sidebar-link`/`.sidebar-link.active` styling from Task 2 (already flex + gap, ready to hold an icon + label side by side).

- [ ] **Step 1: Read the current files first**

Read `apps/desktop/src/components/Sidebar.tsx` and `apps/desktop/src/components/Sidebar.test.tsx` in full.

- [ ] **Step 2: Install the new dependency**

Run: `npm install lucide-react -w @llz-clipper/desktop`

- [ ] **Step 3: Write the failing test**

Add to `apps/desktop/src/components/Sidebar.test.tsx`, inside the existing `describe("Sidebar", ...)` block (keep the 3 existing tests exactly as they are — they already pass by locating items via `getByText(label)`, which doesn't change):

```ts
  it("renders an icon (not emoji) for each nav item", () => {
    renderSidebar();
    expect(screen.getByLabelText("VOD")).toBeInTheDocument();
    expect(screen.getByLabelText("CLIPS")).toBeInTheDocument();
    expect(screen.getByLabelText("EDITOR")).toBeInTheDocument();
    expect(screen.getByLabelText("STREAMERS")).toBeInTheDocument();
    expect(screen.getByLabelText("CONFIGURAÇÕES")).toBeInTheDocument();
  });
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -w @llz-clipper/desktop -- Sidebar`
Expected: FAIL — no element has `aria-label="VOD"` etc. yet (the current emoji spans have no `aria-label`).

- [ ] **Step 5: Replace `Sidebar.tsx`'s full content**

```tsx
import { NavLink } from "react-router-dom";
import { Video, Flame, Film, Users, Settings, Shield } from "lucide-react";
import { useAuthStore } from "../stores/authStore";

const NAV_ITEMS = [
  { to: "/vod", label: "VOD", Icon: Video },
  { to: "/clips", label: "CLIPS", Icon: Flame },
  { to: "/editor", label: "EDITOR", Icon: Film },
  { to: "/streamers", label: "STREAMERS", Icon: Users },
  { to: "/settings", label: "CONFIGURAÇÕES", Icon: Settings },
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
          <item.Icon size={18} aria-label={item.label} /> {item.label}
        </NavLink>
      ))}
      {role === "ADMIN" && (
        <NavLink to="/admin" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
          <Shield size={18} aria-label="ADMIN" /> ADMIN
        </NavLink>
      )}
    </nav>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -w @llz-clipper/desktop -- Sidebar`
Expected: PASS, all 4 tests (3 pre-existing + 1 new).

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck -w @llz-clipper/desktop`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/package.json apps/desktop/package-lock.json apps/desktop/src/components/Sidebar.tsx apps/desktop/src/components/Sidebar.test.tsx
git commit -m "feat(desktop): replace sidebar emoji with lucide-react icons"
```

(If `package-lock.json` lives at the repo root instead of per-workspace in this project, `git add` the root one instead — check which one `npm install` actually modified.)

---

### Task 4: Login page

**Files:**
- Modify: `apps/desktop/src/styles/global.css` (append)
- Modify: `apps/desktop/src/pages/LoginPage.tsx` (one className addition)

**Interfaces:**
- Consumes: tokens from Task 1, `.btn-primary` from Task 2.

- [ ] **Step 1: Read the current files first**

Read `apps/desktop/src/pages/LoginPage.tsx` and the current end of `apps/desktop/src/styles/global.css`.

- [ ] **Step 2: Add the primary-button class**

In `apps/desktop/src/pages/LoginPage.tsx`, the submit button is the page's single primary action (activate or log in) — the two mode-toggle buttons above the form are secondary. Change:

```tsx
        <button type="submit" disabled={loading}>
          {loading ? "Aguarde…" : mode === "activate" ? "Ativar acesso" : "Entrar"}
        </button>
```

to:

```tsx
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Aguarde…" : mode === "activate" ? "Ativar acesso" : "Entrar"}
        </button>
```

- [ ] **Step 3: Append CSS**

Append to `apps/desktop/src/styles/global.css`:

```css
.login-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
}

.login-page h1 {
  font-size: var(--font-size-2xl);
  text-shadow: var(--glow-sm);
}

.login-toggle {
  display: flex;
  gap: var(--space-2);
}

.login-page form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 320px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
}
```

- [ ] **Step 4: Run the desktop test suite**

Run: `npm test -w @llz-clipper/desktop -- LoginPage`
Expected: PASS, no regressions (`LoginPage.test.tsx` tests behavior, not styling, and the `className` addition doesn't change any queried role/text).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/styles/global.css apps/desktop/src/pages/LoginPage.tsx
git commit -m "feat(desktop): style the login page"
```

---

### Task 5: Streamers page

**Files:**
- Modify: `apps/desktop/src/styles/global.css` (append)
- Modify: `apps/desktop/src/pages/StreamersPage.tsx` (one className addition)
- Modify: `apps/desktop/src/components/StreamerForm.tsx` (one className addition)

**Interfaces:**
- Consumes: tokens from Task 1, `.btn-primary`/`.modal`/`.modal-actions` from Task 2.

- [ ] **Step 1: Read the current files first**

Re-read `apps/desktop/src/pages/StreamersPage.tsx` and `apps/desktop/src/components/StreamerForm.tsx`.

- [ ] **Step 2: Mark the primary buttons**

In `StreamersPage.tsx`, the page's primary action is adding a new streamer. Change:

```tsx
        <button onClick={openCreate}>+ Novo Streamer</button>
```

to:

```tsx
        <button className="btn-primary" onClick={openCreate}>+ Novo Streamer</button>
```

In `StreamerForm.tsx`, the modal's primary action is saving. Change:

```tsx
          <button type="submit" disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
```

to:

```tsx
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
```

Also wrap `StreamerForm.tsx`'s two action buttons in a `.modal-actions` div to use the class Task 2 already defined — change:

```tsx
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
```

(This is a pure wrapping change — the two buttons already exist; `<div className="modal-actions">` just wraps them, no new logic.)

- [ ] **Step 3: Append CSS**

Append to `apps/desktop/src/styles/global.css`:

```css
.streamers-page .page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-5);
}

.streamer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-4);
}

.streamer-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.streamer-card p {
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  margin: 0;
}
```

- [ ] **Step 4: Run the desktop test suite**

Run: `npm test -w @llz-clipper/desktop -- StreamersPage`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/styles/global.css apps/desktop/src/pages/StreamersPage.tsx apps/desktop/src/components/StreamerForm.tsx
git commit -m "feat(desktop): style the streamers page and form modal"
```

---

### Task 6: Settings page

**Files:**
- Modify: `apps/desktop/src/styles/global.css` (append)

**Interfaces:**
- Consumes: tokens from Task 1. No primary button on this page — see reasoning below.

- [ ] **Step 1: Read the current file first**

Re-read `apps/desktop/src/pages/SettingsPage.tsx`.

- [ ] **Step 2: No `.btn-primary` on this page**

`SettingsPage.tsx`'s only actionable button is "Sair" (logout) on the account tab — logout is not a forward-progress "main action" the way Renderizar/Salvar/Aprovar are (it's closer to a neutral utility action), and the 4 tab buttons are equally-weighted navigation, not a single primary CTA. No JSX change in this task — every button on this page stays the default secondary style from Task 2.

- [ ] **Step 3: Append CSS**

Append to `apps/desktop/src/styles/global.css`:

```css
.settings-tabs {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
  border-bottom: 1px solid var(--border);
  padding-bottom: var(--space-3);
}

.settings-tabs button {
  background: none;
  border: none;
  color: var(--text-muted);
  font-weight: var(--font-weight-semibold);
  padding: var(--space-2) var(--space-3);
}

.settings-tabs button.active {
  color: var(--text);
  background: var(--surface);
  border-radius: var(--radius-sm);
}

.settings-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-width: 420px;
}

.settings-panel p {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}
```

- [ ] **Step 4: Run the desktop test suite**

Run: `npm test -w @llz-clipper/desktop -- SettingsPage`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/styles/global.css
git commit -m "feat(desktop): style the settings page"
```

---

### Task 7: Admin page

**Files:**
- Modify: `apps/desktop/src/styles/global.css` (append)

**Interfaces:**
- Consumes: tokens from Task 1. No primary button on this page — see reasoning below.

- [ ] **Step 1: Read the current files first**

Re-read `apps/desktop/src/pages/AdminPage.tsx` and `apps/desktop/src/components/KeyTable.tsx`.

- [ ] **Step 2: No `.btn-primary` on this page**

`AdminPage.tsx` has 4 "Gerar Key" buttons of equal weight (monthly/quarterly/bulk-10/bulk-50) — there is no single obvious "the primary one" among them, and forcing the accent onto an arbitrary pick would misrepresent the UI. All buttons on this page stay the default secondary style. No JSX change in this task.

- [ ] **Step 3: Append CSS**

Append to `apps/desktop/src/styles/global.css`:

```css
.admin-actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-bottom: var(--space-4);
}

.pagination {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.pagination span {
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.key-table {
  width: 100%;
  border-collapse: collapse;
}

.key-table th {
  text-align: left;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
}

.key-table td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
  font-size: var(--font-size-sm);
}

.key-table td button {
  margin-right: var(--space-2);
}
```

- [ ] **Step 4: Run the desktop test suite**

Run: `npm test -w @llz-clipper/desktop -- AdminPage`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/styles/global.css
git commit -m "feat(desktop): style the admin page and key table"
```

---

### Task 8: VOD page

**Files:**
- Modify: `apps/desktop/src/styles/global.css` (append)
- Modify: `apps/desktop/src/pages/VodPage.tsx` (one className addition)

**Interfaces:**
- Consumes: tokens from Task 1, `.btn-primary` from Task 2. Produces the visual rule for "`Job` in progress = accent" applied to `.vod-progress-bar`, which already only renders while `isActive` is true (see `VodCard.tsx`) — no JSX/logic change needed for that part.

- [ ] **Step 1: Read the current files first**

Re-read `apps/desktop/src/pages/VodPage.tsx` and `apps/desktop/src/components/VodCard.tsx`.

- [ ] **Step 2: Mark the primary button**

In `VodPage.tsx`, the page's primary action is submitting the form to add the VOD (the "+ Selecionar VOD" button just opens a native file picker — a supporting step, not the final action). Change:

```tsx
        <button type="submit" disabled={!sourcePath || !streamerId || creating}>
          {creating ? "Adicionando…" : "Adicionar VOD"}
        </button>
```

to:

```tsx
        <button type="submit" className="btn-primary" disabled={!sourcePath || !streamerId || creating}>
          {creating ? "Adicionando…" : "Adicionar VOD"}
        </button>
```

- [ ] **Step 3: Append CSS**

Append to `apps/desktop/src/styles/global.css`:

```css
.vod-form {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
  flex-wrap: wrap;
}

.vod-selected-path {
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  margin: 0;
}

.vod-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-4);
}

.vod-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.vod-card > p {
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  margin: 0;
}

.vod-thumbnail {
  width: 100%;
  border-radius: var(--radius-sm);
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.vod-progress {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.vod-progress-bar {
  height: 6px;
  border-radius: var(--radius-sm);
  background: var(--accent-gradient);
  box-shadow: var(--glow-sm);
  transition: width 0.2s ease;
}

.vod-progress p {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  margin: 0;
}

.vod-metadata {
  list-style: none;
  padding: 0;
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
```

- [ ] **Step 4: Run the desktop test suite**

Run: `npm test -w @llz-clipper/desktop -- VodPage VodCard`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/styles/global.css apps/desktop/src/pages/VodPage.tsx
git commit -m "feat(desktop): style the VOD page and cards"
```

---

### Task 9: Clips page

**Files:**
- Modify: `apps/desktop/src/styles/global.css` (append)
- Modify: `apps/desktop/src/components/ClipCard.tsx` (two className additions)

**Interfaces:**
- Consumes: tokens from Task 1, `.btn-primary` from Task 2. Produces `.clip-status-rendering` (new class, mirroring the existing `.clip-status-approved`/`.clip-status-rejected` pattern) for the in-progress-render indicator text.

- [ ] **Step 1: Read the current files first**

Re-read `apps/desktop/src/pages/ClipsPage.tsx` and `apps/desktop/src/components/ClipCard.tsx`.

- [ ] **Step 2: Mark the primary button and the in-progress status text**

In `ClipCard.tsx`, "Aprovar" is the primary forward-progress action for a `DETECTED` clip. Change:

```tsx
      {clip.status === "DETECTED" && (
        <div className="clip-actions">
          <button onClick={onApprove}>Aprovar</button>
          <button onClick={onReject}>Rejeitar</button>
        </div>
      )}
```

to:

```tsx
      {clip.status === "DETECTED" && (
        <div className="clip-actions">
          <button className="btn-primary" onClick={onApprove}>Aprovar</button>
          <button onClick={onReject}>Rejeitar</button>
        </div>
      )}
```

And give the "Renderizando…" status text its own class, mirroring `.clip-status-approved`/`.clip-status-rejected` right below it. Change:

```tsx
      {clip.status === "RENDERING" && (
        <div className="clip-actions">
          <p>Renderizando… ({clip.latestRender?.progress ?? 0}%)</p>
        </div>
      )}
```

to:

```tsx
      {clip.status === "RENDERING" && (
        <div className="clip-actions">
          <p className="clip-status-rendering">Renderizando… ({clip.latestRender?.progress ?? 0}%)</p>
        </div>
      )}
```

- [ ] **Step 3: Append CSS**

Append to `apps/desktop/src/styles/global.css`:

```css
.clips-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-4);
}

.clip-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.clip-card > p {
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  margin: 0;
}

.clip-reason {
  font-style: italic;
}

.clip-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.clip-status-approved {
  color: var(--success);
  font-weight: var(--font-weight-semibold);
  margin: 0;
}

.clip-status-rendering {
  color: var(--accent-mid);
  font-weight: var(--font-weight-semibold);
  margin: 0;
}

.clip-status-rejected {
  color: var(--danger);
  font-weight: var(--font-weight-semibold);
  margin: 0;
}
```

- [ ] **Step 4: Run the desktop test suite**

Run: `npm test -w @llz-clipper/desktop -- ClipsPage ClipCard`
Expected: PASS, no regressions (the `className` additions don't change any queried role/text — `ClipCard.test.tsx`'s existing assertions query by role/text, not by class).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/styles/global.css apps/desktop/src/components/ClipCard.tsx
git commit -m "feat(desktop): style the clips page and cards"
```

---

### Task 10: Editor page and its components

**Files:**
- Modify: `apps/desktop/src/styles/global.css` (append)
- Modify: `apps/desktop/src/pages/EditorPage.tsx` (two className additions)

**Interfaces:**
- Consumes: tokens from Task 1, `.btn-primary`/`.form-error` from Task 2. Produces the visual rule for "`Render` in progress = accent" applied to `.render-progress-bar`, which already only renders while `isActiveRender` is true — no JSX/logic change needed for that part. Covers CSS for every `components/editor/*` component in one task since they only ever render together, inside this one page.

- [ ] **Step 1: Read the current files first**

Re-read `apps/desktop/src/pages/EditorPage.tsx` and every file under `apps/desktop/src/components/editor/` (`TrimControls.tsx`, `CaptionEditor.tsx`, `ZoomEditor.tsx`, `SfxEditor.tsx`, `MusicPicker.tsx`, `WatermarkPicker.tsx`, `VideoPreview.tsx`).

- [ ] **Step 2: Mark the two primary buttons**

Per this plan's spec, "Salvar alterações" and "Renderizar" are both primary forward-progress actions on this page (the spec's own examples list both together). In `EditorPage.tsx`, change:

```tsx
      <button onClick={() => void handleSave()} disabled={saving || fieldsDisabled}>
        {saving ? "Salvando…" : "Salvar alterações"}
      </button>
```

to:

```tsx
      <button className="btn-primary" onClick={() => void handleSave()} disabled={saving || fieldsDisabled}>
        {saving ? "Salvando…" : "Salvar alterações"}
      </button>
```

and change:

```tsx
        {canRender && (
          <button onClick={() => void handleRender()} disabled={rendering}>
            {rendering ? "Iniciando…" : "Renderizar"}
          </button>
        )}
```

to:

```tsx
        {canRender && (
          <button className="btn-primary" onClick={() => void handleRender()} disabled={rendering}>
            {rendering ? "Iniciando…" : "Renderizar"}
          </button>
        )}
```

- [ ] **Step 3: Append CSS**

Append to `apps/desktop/src/styles/global.css`:

```css
.editor-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 720px;
}

.editor-page > label {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.editor-page fieldset {
  border: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.trim-controls {
  display: flex;
  gap: var(--space-4);
}

.trim-controls label {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.caption-editor,
.zoom-editor,
.sfx-editor,
.music-picker,
.watermark-picker {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.caption-row,
.zoom-row,
.sfx-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.render-panel {
  border-top: 1px solid var(--border);
  padding-top: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.render-progress {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.render-progress-bar {
  height: 6px;
  border-radius: var(--radius-sm);
  background: var(--accent-gradient);
  box-shadow: var(--glow-sm);
  transition: width 0.2s ease;
}

.render-progress p {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  margin: 0;
}
```

- [ ] **Step 4: Run the desktop test suite**

Run: `npm test -w @llz-clipper/desktop -- EditorPage TrimControls CaptionEditor ZoomEditor SfxEditor MusicPicker WatermarkPicker VideoPreview`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/styles/global.css apps/desktop/src/pages/EditorPage.tsx
git commit -m "feat(desktop): style the editor page and its components"
```

---

### Task 11: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS, every test file green.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w @llz-clipper/desktop`
Expected: clean.

- [ ] **Step 3: Confirm no stray token references remain**

Run: `grep -rn "var(--accent)" apps/desktop/src` (the old single-color `--accent` token no longer exists after Task 1 — this must return zero matches).
Expected: no output. If it finds any, that rule was missed by Task 2-10 and needs the same accent-gradient/glow treatment applied to it.

- [ ] **Step 4: Visual check in a live browser**

This step is for whoever is coordinating this plan's execution (the orchestrating session), not a dispatched implementer subagent — it requires actually looking at rendered pages, which only the coordinating session's browser tooling can do.

Start the desktop app's dev server and open it in a browser (Vite serves the app on localhost even though it's a Tauri app — native-only features like the file picker and `revealItemInDir` won't work outside the packaged app, but all CSS/layout is fully visible). Navigate to at least: the login page, the streamers page (with the "+ Novo Streamer" modal open), the settings page, and the VOD page. For each, confirm: the neon gradient/glow appears ONLY on primary buttons, the active sidebar link, and (if a VOD/render happens to be in progress) progress bars — not on every card or every button; text and borders elsewhere are calm and legible; the sidebar shows real icons, not emoji or missing-icon boxes.

If a real backend (Postgres + the API + a logged-in session) isn't available in this environment to reach the authenticated pages, at minimum verify the login page and confirm via code review that every CSS rule added in Tasks 4-10 references only tokens defined in Task 1 (no hardcoded colors, no typos in token names) — cross-check each `var(--...)` used across `global.css` against the token list in Task 1's Step 3.

- [ ] **Step 5: Update the README if it documents desktop styling conventions**

Read `README.md`'s section (if any) describing the desktop app's tech stack or styling approach. If it lists `lucide-react` as a dependency to install manually, or otherwise needs updating to reflect the new design system, update it. If the README has no such section, no change is needed — don't add a new section purely for this (out of scope: this plan is UI polish, not documentation expansion).
