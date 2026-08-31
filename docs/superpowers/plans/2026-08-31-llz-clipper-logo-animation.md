# LLZ CLIPPER — Logo e Animação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable `<Logo>` component (icon + wordmark), three CSS animation techniques (moving-gradient buttons, hover-shine cards, floating orbs behind every page title) applied app-wide, a skeleton loader replacing all "Carregando…" text, and a new Windows app icon — all on top of the already-merged design-token system.

**Architecture:** Pure CSS additions to the single existing `apps/desktop/src/styles/global.css` (no animation library, no CSS modules) plus one new React component (`Logo.tsx`) and mechanical text-to-skeleton swaps across 7 existing files. The Windows icon is generated once, outside the normal implementer-subagent loop, by the orchestrating session itself (rasterizing an SVG requires a live browser, which a dispatched implementer subagent does not have).

**Tech Stack:** React 19, TypeScript, Vite, Vitest, React Testing Library, `@tauri-apps/cli` (already a dependency, used here only for its `icon` subcommand).

**Spec:** `docs/superpowers/specs/2026-08-31-llz-clipper-logo-animation-design.md`

## Global Constraints

- Pure CSS animations only (`@keyframes`/`transition`) — no animation library, no new npm dependency of any kind. The only tool this plan uses beyond what's already installed is `@tauri-apps/cli`'s `icon` subcommand, already available.
- All new CSS goes into the existing single `apps/desktop/src/styles/global.css` — no CSS modules, no new CSS files.
- Three animation techniques, exactly where the spec says:
  1. Moving gradient on `.btn-primary` (every primary button, app-wide — no exceptions for dense screens, this was the user's explicit, informed choice).
  2. Hover-shine + lift on every card-shaped surface at rest: `.streamer-card`, `.vod-card`, `.clip-card`, and the existing grouped selector `.caption-editor, .zoom-editor, .sfx-editor, .music-picker, .watermark-picker`.
  3. Floating orbs behind every page's `<h1>`, including the login screen (via the global `h1` selector — not per-page).
- The skeleton loader (`.skeleton-line`) replaces exactly these 8 existing "Carregando…" call sites — no others, no new loading states invented: `App.tsx:55`, `AdminPage.tsx:105`, `ClipsPage.tsx:29`, `SettingsPage.tsx:57`, `SettingsPage.tsx:75`, `EditorPage.tsx:94`, `StreamersPage.tsx:44`, `VodPage.tsx:68`.
- Out of scope: light mode, any layout/navigation/flow change, route-transition animation, verifying the generated macOS/Linux icon files (this project is Windows-only — only the `.ico` is checked).

---

### Task 1: `<Logo>` component

**Files:**
- Create: `apps/desktop/src/components/Logo.tsx`
- Create: `apps/desktop/src/components/Logo.test.tsx`
- Modify: `apps/desktop/src/styles/global.css` (append)

**Interfaces:**
- Produces: `Logo({ size?: "sm" | "lg" }): JSX.Element` — the icon+wordmark logo, default export not used (named export `Logo`, matching every other component in this codebase). Consumed by Task 2 (`Sidebar.tsx`, `LoginPage.tsx`).

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/components/Logo.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Logo } from "./Logo";

describe("Logo", () => {
  it("renders the wordmark text", () => {
    render(<Logo />);
    expect(screen.getByText("LLZ")).toBeInTheDocument();
    expect(screen.getByText("CLIPPER")).toBeInTheDocument();
  });

  it("renders a larger icon for size='lg' than the default size='sm'", () => {
    const { container: smContainer } = render(<Logo />);
    const { container: lgContainer } = render(<Logo size="lg" />);

    const smSvg = smContainer.querySelector("svg");
    const lgSvg = lgContainer.querySelector("svg");

    expect(smSvg).not.toBeNull();
    expect(lgSvg).not.toBeNull();
    expect(Number(lgSvg!.getAttribute("width"))).toBeGreaterThan(Number(smSvg!.getAttribute("width")));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @llz-clipper/desktop -- Logo`
Expected: FAIL — `Logo` module not found

- [ ] **Step 3: Implement**

Create `apps/desktop/src/components/Logo.tsx`:

```tsx
interface LogoProps {
  size?: "sm" | "lg";
}

export function Logo({ size = "sm" }: LogoProps) {
  const iconSize = size === "lg" ? 40 : 22;
  const fontSize = size === "lg" ? 28 : 16;
  const gradientId = `logo-gradient-${size}`;

  return (
    <span className="app-logo">
      <svg width={iconSize} height={iconSize} viewBox="0 0 40 40" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff2ec4" />
            <stop offset="50%" stopColor="#7c3bff" />
            <stop offset="100%" stopColor="#3b8bff" />
          </linearGradient>
        </defs>
        <path d="M8 6 L8 34 L32 20 Z" fill={`url(#${gradientId})`} />
      </svg>
      <span className="app-logo-text" style={{ fontSize }}>
        LLZ<span className="app-logo-text-accent">CLIPPER</span>
      </span>
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @llz-clipper/desktop -- Logo`
Expected: PASS, both tests.

- [ ] **Step 5: Append CSS for the logo's internal layout**

Append to `apps/desktop/src/styles/global.css`:

```css
.app-logo {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.app-logo-text {
  font-weight: var(--font-weight-extrabold);
  letter-spacing: 0.3px;
  color: var(--text);
}

.app-logo-text-accent {
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

(This makes `Logo` a fully self-contained, correctly-styled component on its own — it doesn't yet appear anywhere in the app, since no page renders it until Task 2, but rendering it in isolation, e.g. via the test in Step 1, already looks right.)

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck -w @llz-clipper/desktop`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/components/Logo.tsx apps/desktop/src/components/Logo.test.tsx apps/desktop/src/styles/global.css
git commit -m "feat(desktop): add the Logo component"
```

---

### Task 2: Wire `<Logo>` into the sidebar and login page

**Files:**
- Modify: `apps/desktop/src/components/Sidebar.tsx`
- Modify: `apps/desktop/src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: `Logo` and its CSS from Task 1.

- [ ] **Step 1: Read the current files first**

Re-read `apps/desktop/src/components/Sidebar.tsx` and `apps/desktop/src/pages/LoginPage.tsx` — they may have changed since this plan was written.

- [ ] **Step 2: Replace the plain-text title in Sidebar**

In `Sidebar.tsx`, add the import:

```tsx
import { Logo } from "./Logo";
```

And change:

```tsx
      <div className="sidebar-title">LLZ CLIPPER</div>
```

to:

```tsx
      <div className="sidebar-title">
        <Logo />
      </div>
```

- [ ] **Step 3: Replace the plain-text title in LoginPage**

In `LoginPage.tsx`, add the import:

```tsx
import { Logo } from "../components/Logo";
```

And change:

```tsx
      <h1>LLZ CLIPPER</h1>
```

to:

```tsx
      <h1>
        <Logo size="lg" />
      </h1>
```

(The `<h1>` tag is kept deliberately — Task 5's floating-orb CSS targets the global `h1` selector, so keeping this a real `<h1>` is what makes the orb effect apply to the login screen automatically, with no extra CSS needed for this page specifically.)

- [ ] **Step 4: Run the relevant tests**

Run: `npm test -w @llz-clipper/desktop -- Sidebar LoginPage`
Expected: PASS. (`Sidebar.test.tsx` and `LoginPage.test.tsx` never asserted the literal text "LLZ CLIPPER" — confirmed by grep before writing this plan — so no test file needs editing in this task.)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/Sidebar.tsx apps/desktop/src/pages/LoginPage.tsx
git commit -m "feat(desktop): use the Logo component in the sidebar and login page"
```

---

### Task 3: Moving-gradient primary buttons

**Files:**
- Modify: `apps/desktop/src/styles/global.css`

**Interfaces:**
- Consumes: the existing `.btn-primary` rule (from the prior visual-redesign phase).

- [ ] **Step 1: Read the current file first**

Re-read `apps/desktop/src/styles/global.css` to confirm the exact current `.btn-primary` block (it should be lines 54-63: the base rule and its `:hover:not(:disabled)` rule).

- [ ] **Step 2: Replace the `.btn-primary` block**

Change:

```css
.btn-primary {
  background: var(--accent-gradient);
  color: white;
  border: none;
  box-shadow: var(--glow-sm);
}

.btn-primary:hover:not(:disabled) {
  box-shadow: var(--glow-md);
}
```

to:

```css
.btn-primary {
  background: var(--accent-gradient);
  background-size: 200% 100%;
  color: white;
  border: none;
  box-shadow: var(--glow-sm);
  animation: btn-gradient-move 4s ease-in-out infinite alternate;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.btn-primary:hover:not(:disabled) {
  box-shadow: var(--glow-md);
  transform: scale(1.05);
}

@keyframes btn-gradient-move {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 100% 50%;
  }
}
```

(The animation alternates back and forth between 0% and 100% background-position rather than looping in one direction — this avoids a visible seam, since `--accent-gradient` is a 3-stop gradient that doesn't loop back to its own start color. Do not change `--accent-gradient` itself or add a new token; this technique works with the existing one.)

- [ ] **Step 3: Run the desktop test suite**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS, full suite (this is a pure CSS change — no test asserts on computed animation/transform styles).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/styles/global.css
git commit -m "feat(desktop): animate the primary button's gradient"
```

---

### Task 4: Hover-shine cards

**Files:**
- Modify: `apps/desktop/src/styles/global.css`

**Interfaces:**
- Consumes: the existing `.streamer-card`, `.vod-card`, `.clip-card`, and `.caption-editor, .zoom-editor, .sfx-editor, .music-picker, .watermark-picker` rules — this task does not modify those existing rules, it appends a new, separate rule targeting the same selectors for the hover/shine layer.

- [ ] **Step 1: Read the current file first**

Re-read `apps/desktop/src/styles/global.css` to confirm the exact current card selectors are unchanged from what this plan assumes.

- [ ] **Step 2: Append the hover-shine CSS**

Append to `apps/desktop/src/styles/global.css`:

```css
.streamer-card,
.vod-card,
.clip-card,
.caption-editor,
.zoom-editor,
.sfx-editor,
.music-picker,
.watermark-picker {
  position: relative;
  overflow: hidden;
  transition: transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.3);
}

.streamer-card::before,
.vod-card::before,
.clip-card::before,
.caption-editor::before,
.zoom-editor::before,
.sfx-editor::before,
.music-picker::before,
.watermark-picker::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent, rgba(124, 59, 255, 0.15), transparent);
  transform: translateX(-100%);
  transition: transform 0.6s ease;
  pointer-events: none;
}

.streamer-card:hover,
.vod-card:hover,
.clip-card:hover,
.caption-editor:hover,
.zoom-editor:hover,
.sfx-editor:hover,
.music-picker:hover,
.watermark-picker:hover {
  transform: translateY(-4px);
}

.streamer-card:hover::before,
.vod-card:hover::before,
.clip-card:hover::before,
.caption-editor:hover::before,
.zoom-editor:hover::before,
.sfx-editor:hover::before,
.music-picker:hover::before,
.watermark-picker:hover::before {
  transform: translateX(100%);
}
```

(`overflow: hidden` on these cards clips the sweeping shine to the card's own bounds — verify no card currently relies on content overflowing its box, e.g. a dropdown or tooltip escaping the card; if you find one, flag it as a concern in your report rather than silently dropping `overflow: hidden` for that selector.)

- [ ] **Step 3: Run the desktop test suite**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS, full suite (pure CSS change).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/styles/global.css
git commit -m "feat(desktop): add hover-shine and lift to cards"
```

---

### Task 5: Floating orbs behind page titles

**Files:**
- Modify: `apps/desktop/src/styles/global.css`

**Interfaces:**
- Consumes: the existing global `h1` rule (from the prior visual-redesign phase) and the `<h1>` wrapping `<Logo size="lg" />` from Task 2 — this task requires Task 2 to already be merged, since the orb effect only reaches the login screen because Task 2 kept a real `<h1>` tag there.

- [ ] **Step 1: Read the current file first**

Re-read `apps/desktop/src/styles/global.css` to confirm the exact current `h1` rule (should be lines 15-20: `font-size`, `font-weight`, `letter-spacing`, `margin`).

- [ ] **Step 2: Extend the `h1` rule and add the orb pseudo-elements**

Change:

```css
h1 {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-extrabold);
  letter-spacing: 0.3px;
  margin: 0 0 var(--space-4);
}
```

to:

```css
h1 {
  position: relative;
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-extrabold);
  letter-spacing: 0.3px;
  margin: 0 0 var(--space-4);
}

h1::before,
h1::after {
  content: "";
  position: absolute;
  width: 70px;
  height: 70px;
  border-radius: 50%;
  z-index: -1;
  pointer-events: none;
  animation: h1-orb-float 3.5s ease-in-out infinite;
}

h1::before {
  background: radial-gradient(circle, rgba(255, 46, 196, 0.35), transparent 70%);
  top: -20px;
  left: -10px;
}

h1::after {
  background: radial-gradient(circle, rgba(59, 139, 255, 0.35), transparent 70%);
  top: -20px;
  left: 40px;
  animation-delay: -1.5s;
}

@keyframes h1-orb-float {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-14px) scale(1.15);
  }
}
```

(This is a global `h1` selector — it applies to every page's title automatically, including the login screen's, with no per-page CSS needed. The pixel offsets are a reasonable starting point verified against the mockup during brainstorming, not pixel-perfect for every heading length — Task 8's live visual check is where any adjustment for very short titles like "VOD" or "Admin" happens, if needed.)

- [ ] **Step 3: Run the desktop test suite**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS, full suite (pure CSS change).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/styles/global.css
git commit -m "feat(desktop): add floating orbs behind page titles"
```

---

### Task 6: Skeleton loader

**Files:**
- Modify: `apps/desktop/src/styles/global.css` (append)
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/pages/AdminPage.tsx`
- Modify: `apps/desktop/src/pages/ClipsPage.tsx`
- Modify: `apps/desktop/src/pages/SettingsPage.tsx`
- Modify: `apps/desktop/src/pages/EditorPage.tsx`
- Modify: `apps/desktop/src/pages/StreamersPage.tsx`
- Modify: `apps/desktop/src/pages/VodPage.tsx`

**Interfaces:**
- Produces: `.skeleton-line` CSS class, used identically at all 8 call sites — `<div className="skeleton-line" style={{ width: "120px" }} role="status" aria-label="Carregando" />`.

- [ ] **Step 1: Read the current files first**

Re-read all 7 `.tsx` files listed above — confirm each "Carregando…" line still matches what this plan assumes before editing.

- [ ] **Step 2: Append the skeleton CSS**

Append to `apps/desktop/src/styles/global.css`:

```css
.skeleton-line {
  height: 14px;
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--surface-raised) 25%, var(--border) 37%, var(--surface-raised) 63%);
  background-size: 400% 100%;
  animation: skeleton-shimmer 1.4s ease infinite;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}
```

- [ ] **Step 3: Replace all 8 call sites**

In `apps/desktop/src/App.tsx`, change:

```tsx
    return <div className="app-loading">Carregando…</div>;
```

to:

```tsx
    return (
      <div className="app-loading">
        <div className="skeleton-line" style={{ width: "120px" }} role="status" aria-label="Carregando" />
      </div>
    );
```

In `apps/desktop/src/pages/AdminPage.tsx`, change:

```tsx
      {loading ? (
        <p>Carregando…</p>
      ) : (
```

to:

```tsx
      {loading ? (
        <div className="skeleton-line" style={{ width: "120px" }} role="status" aria-label="Carregando" />
      ) : (
```

In `apps/desktop/src/pages/ClipsPage.tsx`, change:

```tsx
      {!selectedVodId ? (
        <p>Selecione um VOD para ver os clipes detectados.</p>
      ) : loading ? (
        <p>Carregando…</p>
      ) : clips.length === 0 ? (
```

to:

```tsx
      {!selectedVodId ? (
        <p>Selecione um VOD para ver os clipes detectados.</p>
      ) : loading ? (
        <div className="skeleton-line" style={{ width: "120px" }} role="status" aria-label="Carregando" />
      ) : clips.length === 0 ? (
```

In `apps/desktop/src/pages/SettingsPage.tsx`, there are two separate occurrences — change the first:

```tsx
      {tab === "account" ? (
        loading ? (
          <p>Carregando…</p>
        ) : me ? (
```

to:

```tsx
      {tab === "account" ? (
        loading ? (
          <div className="skeleton-line" style={{ width: "120px" }} role="status" aria-label="Carregando" />
        ) : me ? (
```

and the second:

```tsx
      ) : tab === "processing" ? (
        processingLoading ? (
          <p>Carregando…</p>
        ) : ffmpegStatus?.available ? (
```

to:

```tsx
      ) : tab === "processing" ? (
        processingLoading ? (
          <div className="skeleton-line" style={{ width: "120px" }} role="status" aria-label="Carregando" />
        ) : ffmpegStatus?.available ? (
```

In `apps/desktop/src/pages/EditorPage.tsx`, change:

```tsx
  if (loading) return <p>Carregando…</p>;
```

to:

```tsx
  if (loading) {
    return <div className="skeleton-line" style={{ width: "120px" }} role="status" aria-label="Carregando" />;
  }
```

In `apps/desktop/src/pages/StreamersPage.tsx`, change:

```tsx
      {loading ? (
        <p>Carregando…</p>
      ) : (
        <div className="streamer-grid">
```

to:

```tsx
      {loading ? (
        <div className="skeleton-line" style={{ width: "120px" }} role="status" aria-label="Carregando" />
      ) : (
        <div className="streamer-grid">
```

In `apps/desktop/src/pages/VodPage.tsx`, change:

```tsx
      {loading ? (
        <p>Carregando…</p>
      ) : (
        <div className="vod-grid">
```

to:

```tsx
      {loading ? (
        <div className="skeleton-line" style={{ width: "120px" }} role="status" aria-label="Carregando" />
      ) : (
        <div className="vod-grid">
```

- [ ] **Step 4: Run the full desktop test suite**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS, full suite. `SettingsPage.test.tsx:75`'s `expect(screen.queryByText("Carregando…")).not.toBeInTheDocument()` continues to pass — it checks the text is *absent* once loading finishes, which remains true regardless of what was shown while loading (the skeleton is also gone once `me`/`ffmpegStatus` resolves). No other test in these 7 files references the string "Carregando…" — confirmed by grep before writing this plan. If you find one that does, treat it as a real gap: update the assertion to check for the skeleton (e.g. `screen.getByRole("status")`) rather than skip it.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/styles/global.css apps/desktop/src/App.tsx apps/desktop/src/pages/AdminPage.tsx apps/desktop/src/pages/ClipsPage.tsx apps/desktop/src/pages/SettingsPage.tsx apps/desktop/src/pages/EditorPage.tsx apps/desktop/src/pages/StreamersPage.tsx apps/desktop/src/pages/VodPage.tsx
git commit -m "feat(desktop): replace loading text with an animated skeleton"
```

---

### Task 7: Windows app icon

**This task is for the orchestrating session itself, not a dispatched implementer subagent.** Generating the icon requires rasterizing an SVG into a high-resolution PNG, which needs a live browser — a dispatched implementer subagent has no browser access. This mirrors Task 11 of the prior visual-redesign plan (`docs/superpowers/plans/2026-08-30-llz-clipper-visual-redesign.md`), which had an orchestrator-only live-browser verification step for the same reason.

**Files:**
- Overwrites: every file under `apps/desktop/src-tauri/icons/` (generated by the `tauri icon` CLI — do not hand-edit any of them)

**Interfaces:** none (no code interface — this task produces binary icon assets `tauri.conf.json` already references by name).

- [ ] **Step 1: Build a high-resolution source image of the icon-only mark**

The icon-only mark (option C from the logo brainstorm — a rounded-square badge with the gradient play-triangle, distinct from the `<Logo>` component's icon+wordmark used inside the app) needs to exist as a real PNG file before `tauri icon` can use it. Using the Browser pane:

1. Write a standalone HTML file (e.g. to the scratchpad directory) containing just the SVG mark at a large size, matching this shape (same play-triangle path and gradient as `Logo.tsx`, but inside the rounded-square badge, no wordmark):

```html
<!doctype html>
<html>
<body style="margin:0">
<svg width="1024" height="1024" viewBox="0 0 70 70" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff2ec4"/>
      <stop offset="50%" stop-color="#7c3bff"/>
      <stop offset="100%" stop-color="#3b8bff"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="62" height="62" rx="16" fill="#151519" stroke="url(#g)" stroke-width="2.5"/>
  <path d="M24 20 L24 50 L50 35 Z" fill="url(#g)"/>
</svg>
</body>
</html>
```

2. Open this file in the Browser pane (`navigate` with a `file://` URL, or serve it via `preview_start`).
3. Take a screenshot at the rendered 1024x1024 size and save it as a PNG to a local path (e.g. `apps/desktop/src-tauri/icons/source-1024.png`, deleted again in Step 3 once `tauri icon` has consumed it — it is not itself one of the files `tauri.conf.json` references).

- [ ] **Step 2: Run the Tauri icon generator**

From `apps/desktop/src-tauri`, run:

```bash
npx tauri icon apps/desktop/src-tauri/icons/source-1024.png
```

(Adjust the relative path to the source PNG based on where you saved it in Step 1.) This overwrites every file in `apps/desktop/src-tauri/icons/` with a new set generated from the source image — `icon.ico` (Windows), `icon.icns` (macOS), and the various PNG sizes. `tauri.conf.json`'s `bundle.icon` array already points at these exact filenames — no edit to `tauri.conf.json` is needed.

- [ ] **Step 3: Delete the temporary source PNG**

Delete `apps/desktop/src-tauri/icons/source-1024.png` (or wherever you saved it in Step 1) — it is not one of the files Tauri's build config references, and leaving it in `icons/` would be a stray unused file.

- [ ] **Step 4: Verify the new icon looks correct**

The generated `icon.ico`/`icon.png` files are binary — visually open one (e.g. `apps/desktop/src-tauri/icons/128x128.png`) to confirm it shows the new gradient badge, not the old default Tauri logo it replaced.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/icons/
git commit -m "feat(desktop): replace the app icon with the new brand mark"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS, every test file green.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w @llz-clipper/desktop`
Expected: clean.

- [ ] **Step 3: Confirm every "Carregando…" call site was actually replaced**

Run: `grep -rn "Carregando…" apps/desktop/src --include=*.tsx | grep -v test.tsx`
Expected: no output (only test files may still reference the string, e.g. `SettingsPage.test.tsx`'s absence-check).

- [ ] **Step 4: Live visual check in a browser**

This step is for the orchestrating session, not a dispatched implementer subagent — same reasoning as Task 7. Start the desktop app's dev server and open it in a browser. Confirm, across at least the login page and one authenticated page (Streamers or VOD, whichever has real data or can render with none):

- The logo renders correctly at both sizes (small in the sidebar, large on the login screen).
- Primary buttons show a visibly moving gradient, not a static one.
- Hovering a card (a streamer card, a VOD card, or a clip card) shows the shine sweep and a slight lift.
- Every page title has a subtle floating-orb glow behind it — confirm this doesn't look broken or misplaced on a short title like "VOD" or "Admin"; if the fixed pixel offsets from Task 5 look wrong on a short heading, adjust them directly in `global.css` and note the change in your final report (this is exactly the kind of visual-fit adjustment Task 5 flagged as expected here, not a defect to route through a separate task).
- The skeleton loader appears (briefly) instead of "Carregando…" text — this may be hard to catch on a fast local network; throttling isn't required, a best-effort visual confirmation is enough.

- [ ] **Step 5: Update the README if it documents desktop styling conventions**

Read `README.md` for any section describing the desktop app's tech stack or styling approach (the prior visual-redesign phase found none — check again in case it changed). If it still has no such section, no change is needed.
