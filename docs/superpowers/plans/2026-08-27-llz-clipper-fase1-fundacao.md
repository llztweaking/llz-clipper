# LLZ CLIPPER — Fase 1 (Fundação) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the real, working foundation of LLZ CLIPPER: a monorepo with a Postgres-backed schema, a Fastify API implementing key-based licensing, authentication, admin key management, and streamer CRUD — all with real tests against a real database. No mocked processing, no fake endpoints.

**Architecture:** npm-workspaces monorepo (`apps/`, `services/`, `packages/`). `packages/database` owns the Prisma schema/migrations and a shared client; `packages/shared` and `packages/types` hold cross-cutting pure logic and DTOs; `services/api` is the Fastify HTTP server implementing auth, licensing, admin, and streamers against the local PostgreSQL `llz_clipper` database. `apps/desktop` and `services/worker` are empty placeholder workspaces reserved for Fases 2–3.

**Tech Stack:** Node.js 22, TypeScript, Fastify 5, Prisma (PostgreSQL), Zod, bcryptjs, jsonwebtoken, `@fastify/rate-limit`, Vitest, npm workspaces, tsx.

**Spec:** `docs/superpowers/specs/2026-08-27-llz-clipper-fase1-fundacao-design.md`

## Global Constraints

- No secret, API key, or credential ever lives in source code — everything comes from `.env` (gitignored); `.env.example` documents every key.
- Passwords are hashed with **bcryptjs** (pure JS) — not native `bcrypt` — because this machine's Rust/Node toolchain was deliberately set up with the GNU/MinGW toolchain instead of MSVC Build Tools, and native Node addons compiled via `node-gyp` on Windows default to expecting MSVC. Using a pure-JS hashing library avoids a native compile step entirely.
- Refresh tokens are stored only as a SHA-256 hash (`packages/shared`'s `hashToken`) — the plaintext token is returned to the client once and never persisted.
- Every route except `/auth/*` requires `Authorization: Bearer <accessToken>`; every route under `/admin/*` additionally requires `role = ADMIN`. License status (`ACTIVE` + not expired) is re-checked on every authenticated request, not just at login.
- Package manager is **npm workspaces** only — no pnpm/yarn.
- Run all shell commands through a POSIX-style shell (Git Bash), matching the environment already configured on this machine — not PowerShell-specific syntax.
- Internal workspace packages (`@llz-clipper/shared`, `@llz-clipper/types`, `@llz-clipper/database`) export their TypeScript source directly (`main`/`types` point at `src/index.ts`) — there is no compiled `dist/` build step for them in this phase. `tsx` and Vitest transpile on the fly.
- `VOD`, `Clip`, `EditPlan`, `Job`, `Render`, `Preset` exist in the Prisma schema (so no destructive migration is needed later) but get **no routes or services** in this plan — that is Fases 3–5, explicitly out of scope here.
- The `POST /auth/activate-key` rule for an already-`ACTIVE` key is unconditional: any key with `status = ACTIVE` is rejected with `409 key_already_linked`, regardless of which email is submitted. (This resolves an ambiguity in the design doc's wording in favor of the simpler, safer rule stated in spec §5: "já vinculada → bloquear".)

---

## Environment already prepared (do not redo)

- PostgreSQL 16 running as a Windows service, database `llz_clipper` and app user `llz_app` / `llz_app_dev_pw` already created (superuser `postgres` / `llzclipper_dev`).
- Node 22, Rust GNU toolchain, GCC/MinGW, FFmpeg — installed and on PATH.
- Project root: `C:\Users\Administrador\Downloads\LLZ-CLIPPER`, git repo already initialized there with one commit (the design spec).

This plan still needs to create the `llz_clipper_test` database (Task 4) — that has not been done yet.

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json` (root)
- Create: `.gitignore`
- Create: `tsconfig.base.json`
- Create: `.env.example`
- Create: `README.md` (stub — full content lands in Task 13)
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/README.md`
- Create: `services/worker/package.json`
- Create: `services/worker/src/index.ts`

**Interfaces:**
- Produces: npm workspace layout (`apps/*`, `services/*`, `packages/*`) that every later task's `npm install -w <name>` relies on.

- [ ] **Step 1: Create the root config files**

`package.json`:
```json
{
  "name": "llz-clipper",
  "private": true,
  "workspaces": [
    "apps/*",
    "services/*",
    "packages/*"
  ],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  }
}
```

`.gitignore`:
```
node_modules/
dist/
.env
.env.test
*.log
.DS_Store
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "outDir": "dist"
  }
}
```

`.env.example`:
```
DATABASE_URL="postgresql://llz_app:llz_app_dev_pw@localhost:5432/llz_clipper"
JWT_SECRET="replace-with-a-long-random-secret"
JWT_ACCESS_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_DAYS="30"
PORT="3000"
```

`README.md`:
```markdown
# LLZ CLIPPER

Fase 1 (Fundação) em desenvolvimento. Ver `docs/superpowers/specs/` e
`docs/superpowers/plans/` para o design e o plano de implementação.
```

- [ ] **Step 2: Create the placeholder `apps/desktop` workspace**

`apps/desktop/package.json`:
```json
{
  "name": "@llz-clipper/desktop",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "echo \"Desktop app (Tauri) e a Fase 2 do projeto - ainda nao implementado\" && exit 1"
  }
}
```

`apps/desktop/README.md`:
```markdown
# LLZ CLIPPER — Desktop

Placeholder. O app desktop (Tauri + React + TypeScript) é a Fase 2 do
projeto e ainda não foi implementado.
```

- [ ] **Step 3: Create the placeholder `services/worker` workspace**

`services/worker/package.json`:
```json
{
  "name": "@llz-clipper/worker",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "node --loader tsx src/index.ts"
  }
}
```

`services/worker/src/index.ts`:
```ts
console.log(
  "LLZ CLIPPER worker: pipeline de jobs ainda não implementado (Fase 3). Nada para processar."
);
```

- [ ] **Step 4: Install and verify the workspace resolves**

Run: `cd "/c/Users/Administrador/Downloads/LLZ-CLIPPER" && npm install`
Expected: exits 0, creates `node_modules/`, `package-lock.json`. `npm ls --workspaces` lists `@llz-clipper/desktop` and `@llz-clipper/worker`.

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/Administrador/Downloads/LLZ-CLIPPER"
git add package.json .gitignore tsconfig.base.json .env.example README.md apps/desktop services/worker package-lock.json
git commit -m "chore: scaffold npm workspaces monorepo"
```

---

### Task 2: `packages/types` — shared API DTOs

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/src/index.ts`

**Interfaces:**
- Produces: `PlanType`, `KeyStatus`, `Role`, `ActivateKeyRequest`, `ActivateKeyResponse`, `AuthTokens`, `AuthUser`, `LoginRequest`, `RefreshRequest`, `LogoutRequest`, `CreateKeyRequest`, `CreateKeyBulkRequest`, `LicenseKeySummary`, `CreateStreamerRequest`, `StreamerResponse` — imported by `services/api` from Task 5 onward.

- [ ] **Step 1: Create the package**

`packages/types/package.json`:
```json
{
  "name": "@llz-clipper/types",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

`packages/types/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

`packages/types/src/index.ts`:
```ts
export type PlanType = "MONTHLY" | "QUARTERLY";
export type KeyStatus = "UNUSED" | "ACTIVE" | "EXPIRED" | "REVOKED";
export type Role = "USER" | "ADMIN";

export interface ActivateKeyRequest {
  code: string;
  email: string;
  password: string;
  hwid: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface ActivateKeyResponse extends AuthTokens {
  user: AuthUser;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface CreateKeyRequest {
  plan: PlanType;
}

export interface CreateKeyBulkRequest {
  plan: PlanType;
  count: number;
}

export interface LicenseKeySummary {
  id: string;
  code: string;
  plan: PlanType;
  status: KeyStatus;
  createdAt: string;
  activatedAt: string | null;
  expiresAt: string | null;
  userEmail: string | null;
}

export interface CreateStreamerRequest {
  name: string;
  username: string;
  logoUrl?: string;
  watermark?: Record<string, unknown>;
  presetId?: string;
}

export interface StreamerResponse {
  id: string;
  name: string;
  username: string;
  logoUrl: string | null;
  watermark: Record<string, unknown> | null;
  presetId: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Install TypeScript for this workspace and verify it type-checks**

Run: `npm install -D typescript -w @llz-clipper/types`
Run: `npm run typecheck -w @llz-clipper/types`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/types package-lock.json
git commit -m "feat(types): add shared API DTOs package"
```

---

### Task 3: `packages/shared` — key code generator and token hashing (TDD)

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/keyCode.ts`
- Create: `packages/shared/src/keyCode.test.ts`
- Create: `packages/shared/src/tokenHash.ts`
- Create: `packages/shared/src/tokenHash.test.ts`
- Create: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `generateKeyCode(): string`, `isValidKeyCodeFormat(code: string): boolean`, `generateOpaqueToken(): string`, `hashToken(token: string): string` — used by `services/api` (Tasks 6, 8).

- [ ] **Step 1: Create the package and install dependencies**

`packages/shared/package.json`:
```json
{
  "name": "@llz-clipper/shared",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

`packages/shared/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

Run: `npm install -D typescript vitest -w @llz-clipper/shared`

- [ ] **Step 2: Write the failing tests for `keyCode`**

`packages/shared/src/keyCode.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { generateKeyCode, isValidKeyCodeFormat } from "./keyCode";

describe("generateKeyCode", () => {
  it("produces a code matching the LLZ-XXXX-XXXX-XXXX format", () => {
    const code = generateKeyCode();
    expect(isValidKeyCodeFormat(code)).toBe(true);
  });

  it("never includes ambiguous characters (0, O, 1, I)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateKeyCode();
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it("generates unique codes across many calls", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateKeyCode()));
    expect(codes.size).toBe(500);
  });
});

describe("isValidKeyCodeFormat", () => {
  it("rejects malformed codes", () => {
    expect(isValidKeyCodeFormat("not-a-key")).toBe(false);
    expect(isValidKeyCodeFormat("LLZ-1234-5678-90AB")).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w @llz-clipper/shared`
Expected: FAIL — `Cannot find module './keyCode'`.

- [ ] **Step 4: Implement `keyCode.ts`**

`packages/shared/src/keyCode.ts`:
```ts
import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSegment(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function generateKeyCode(): string {
  return `LLZ-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
}

export function isValidKeyCodeFormat(code: string): boolean {
  const pattern = new RegExp(`^LLZ-[${ALPHABET}]{4}-[${ALPHABET}]{4}-[${ALPHABET}]{4}$`);
  return pattern.test(code);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -w @llz-clipper/shared`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing tests for `tokenHash`**

`packages/shared/src/tokenHash.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { generateOpaqueToken, hashToken } from "./tokenHash";

describe("generateOpaqueToken", () => {
  it("generates a 64-character hex string", () => {
    const token = generateOpaqueToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique tokens", () => {
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
  });
});

describe("hashToken", () => {
  it("produces a deterministic sha256 hex digest", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("abc")).not.toBe(hashToken("xyz"));
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npm test -w @llz-clipper/shared`
Expected: FAIL — `Cannot find module './tokenHash'`.

- [ ] **Step 8: Implement `tokenHash.ts` and the package barrel file**

`packages/shared/src/tokenHash.ts`:
```ts
import { randomBytes, createHash } from "node:crypto";

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
```

`packages/shared/src/index.ts`:
```ts
export * from "./keyCode";
export * from "./tokenHash";
```

- [ ] **Step 9: Run to verify it passes**

Run: `npm test -w @llz-clipper/shared`
Expected: PASS (8 tests total).

- [ ] **Step 10: Commit**

```bash
git add packages/shared package-lock.json
git commit -m "feat(shared): add key code generator and token hashing helpers"
```

---

### Task 4: `packages/database` — Prisma schema, migrations, client, test reset helper

**Files:**
- Create: `packages/database/package.json`
- Create: `packages/database/tsconfig.json`
- Create: `packages/database/vitest.config.ts`
- Create: `packages/database/prisma/schema.prisma`
- Create: `packages/database/src/client.ts`
- Create: `packages/database/src/testUtils.ts`
- Create: `packages/database/src/client.smoke.test.ts`
- Create: `packages/database/src/index.ts`
- Create: `.env` (root, gitignored)
- Create: `.env.test` (root, gitignored)

**Interfaces:**
- Produces: `prisma: PrismaClient` singleton, `resetDatabase(): Promise<void>`, plus every Prisma model type (`User`, `LicenseKey`, `Device`, `RefreshToken`, `Streamer`, `VOD`, `Clip`, `EditPlan`, `Preset`, `Job`, `Render`, `UsageLog`) generated by `@prisma/client` — consumed by every `services/api` task from Task 6 onward.

- [ ] **Step 1: Create the package and install dependencies**

`packages/database/package.json`:
```json
{
  "name": "@llz-clipper/database",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "migrate:dev": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy",
    "generate": "prisma generate"
  }
}
```

`packages/database/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

`packages/database/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    hookTimeout: 20000,
    testTimeout: 20000,
  },
});
```

Run: `npm install -D typescript vitest prisma dotenv -w @llz-clipper/database`
Run: `npm install @prisma/client -w @llz-clipper/database`

- [ ] **Step 2: Write the Prisma schema**

`packages/database/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  USER
  ADMIN
}

enum PlanType {
  MONTHLY
  QUARTERLY
}

enum KeyStatus {
  UNUSED
  ACTIVE
  EXPIRED
  REVOKED
}

enum ClipCategory {
  PLAY
  FUNNY
  REACTION
  FAIL
  CLUTCH
  SPOKEN_MOMENT
  IMPORTANT_MOMENT
}

enum ClipStatus {
  DETECTED
  READY
  APPROVED
  REJECTED
  RENDERING
  COMPLETED
  FAILED
}

enum JobStatus {
  QUEUED
  UPLOADING
  PROCESSING_AUDIO
  TRANSCRIBING
  ANALYZING_VIDEO
  ANALYZING_CONTEXT
  DETECTING_CLIPS
  GENERATING_EDIT_PLANS
  RENDERING
  COMPLETED
  FAILED
}

enum RenderStatus {
  QUEUED
  RENDERING
  COMPLETED
  FAILED
}

model User {
  id            String         @id @default(uuid())
  email         String         @unique
  passwordHash  String?
  role          Role           @default(USER)
  createdAt     DateTime       @default(now())
  licenseKeys   LicenseKey[]
  devices       Device[]
  streamers     Streamer[]
  refreshTokens RefreshToken[]
  usageLogs     UsageLog[]
}

model LicenseKey {
  id          String    @id @default(uuid())
  code        String    @unique
  plan        PlanType
  status      KeyStatus @default(UNUSED)
  usageLimit  Int?
  createdAt   DateTime  @default(now())
  activatedAt DateTime?
  expiresAt   DateTime?
  revokedAt   DateTime?
  userId      String?
  user        User?     @relation(fields: [userId], references: [id])
  deviceId    String?
  device      Device?   @relation(fields: [deviceId], references: [id])
}

model Device {
  id          String       @id @default(uuid())
  hwid        String       @unique
  name        String?
  userId      String
  user        User         @relation(fields: [userId], references: [id])
  createdAt   DateTime     @default(now())
  lastSeenAt  DateTime?
  licenseKeys LicenseKey[]
}

model RefreshToken {
  id        String    @id @default(uuid())
  tokenHash String    @unique
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
}

model Streamer {
  id        String   @id @default(uuid())
  name      String
  username  String
  logoUrl   String?
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  presetId  String?
  preset    Preset?  @relation(fields: [presetId], references: [id])
  watermark Json?
  createdAt DateTime @default(now())
  vods      VOD[]
}

model VOD {
  id          String    @id @default(uuid())
  filename    String
  storagePath String
  durationSec Int?
  width       Int?
  height      Int?
  fps         Float?
  sizeBytes   BigInt?
  codec       String?
  streamerId  String
  streamer    Streamer  @relation(fields: [streamerId], references: [id])
  presetId    String?
  preset      Preset?   @relation(fields: [presetId], references: [id])
  createdAt   DateTime  @default(now())
  jobs        Job[]
  clips       Clip[]
}

model Clip {
  id          String        @id @default(uuid())
  vodId       String
  vod         VOD           @relation(fields: [vodId], references: [id])
  startTime   Float
  endTime     Float
  title       String?
  category    ClipCategory?
  score       Int?
  scoreReason String?
  status      ClipStatus    @default(DETECTED)
  createdAt   DateTime      @default(now())
  editPlan    EditPlan?
  renders     Render[]
}

model EditPlan {
  id         String   @id @default(uuid())
  clipId     String   @unique
  clip       Clip     @relation(fields: [clipId], references: [id])
  title      String
  segments   Json
  captions   Json?
  watermark  Json?
  zooms      Json?
  sfx        Json?
  music      Json?
  format     String   @default("9:16")
  resolution String   @default("1080x1920")
  fps        Int      @default(60)
  updatedAt  DateTime @updatedAt
}

model Preset {
  id         String     @id @default(uuid())
  name       String
  title      Boolean    @default(true)
  watermark  Boolean    @default(true)
  captions   Boolean    @default(true)
  zoom       Boolean    @default(false)
  sfx        Boolean    @default(false)
  music      Boolean    @default(false)
  format     String     @default("9:16")
  resolution String     @default("1080x1920")
  fps        Int        @default(60)
  streamers  Streamer[]
  vods       VOD[]
}

model Job {
  id          String    @id @default(uuid())
  vodId       String
  vod         VOD       @relation(fields: [vodId], references: [id])
  status      JobStatus @default(QUEUED)
  progress    Int       @default(0)
  currentStep String?
  error       String?
  createdAt   DateTime  @default(now())
  startedAt   DateTime?
  finishedAt  DateTime?
}

model Render {
  id         String       @id @default(uuid())
  clipId     String
  clip       Clip         @relation(fields: [clipId], references: [id])
  status     RenderStatus @default(QUEUED)
  progress   Int          @default(0)
  outputPath String?
  error      String?
  createdAt  DateTime     @default(now())
  finishedAt DateTime?
}

model UsageLog {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  action    String
  metadata  Json?
  createdAt DateTime @default(now())
}
```

- [ ] **Step 3: Create the dev and test env files (not committed)**

`.env` (repo root):
```
DATABASE_URL="postgresql://llz_app:llz_app_dev_pw@localhost:5432/llz_clipper"
JWT_SECRET="dev-only-secret-change-in-production-6f2a9c"
JWT_ACCESS_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_DAYS="30"
PORT="3000"
```

`.env.test` (repo root):
```
DATABASE_URL="postgresql://llz_app:llz_app_dev_pw@localhost:5432/llz_clipper_test"
JWT_SECRET="test-secret-6f2a9c"
JWT_ACCESS_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_DAYS="30"
PORT="3001"
```

- [ ] **Step 4: Create the test database and run the dev migration**

Run: `PGPASSWORD=llzclipper_dev "/c/Program Files/PostgreSQL/16/bin/psql.exe" -U postgres -h localhost -c "CREATE DATABASE llz_clipper_test;"`
Run: `PGPASSWORD=llzclipper_dev "/c/Program Files/PostgreSQL/16/bin/psql.exe" -U postgres -h localhost -c "GRANT ALL PRIVILEGES ON DATABASE llz_clipper_test TO llz_app;"`
Run: `PGPASSWORD=llzclipper_dev "/c/Program Files/PostgreSQL/16/bin/psql.exe" -U postgres -h localhost -d llz_clipper_test -c "GRANT ALL ON SCHEMA public TO llz_app;"`
Expected: three `CREATE DATABASE`/`GRANT` confirmations.

Run (from `packages/database`, loading root `.env`): `cd packages/database && npx dotenv -e ../../.env -- npx prisma migrate dev --name init`
Expected: creates `packages/database/prisma/migrations/<timestamp>_init/migration.sql` and applies it to `llz_clipper`. If `dotenv-cli` is not installed yet, run `npm install -D dotenv-cli -w @llz-clipper/database` first.

Run: `cd packages/database && npx dotenv -e ../../.env.test -- npx prisma migrate deploy`
Expected: applies the same migration to `llz_clipper_test`.

Run: `npm run generate -w @llz-clipper/database`
Expected: generates the Prisma Client into `node_modules/.prisma/client`.

- [ ] **Step 5: Write the client, test utilities, and barrel file**

`packages/database/src/client.ts`:
```ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export * from "@prisma/client";
```

`packages/database/src/testUtils.ts`:
```ts
import { prisma } from "./client";

export async function resetDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.usageLog.deleteMany(),
    prisma.render.deleteMany(),
    prisma.editPlan.deleteMany(),
    prisma.clip.deleteMany(),
    prisma.job.deleteMany(),
    prisma.vod.deleteMany(),
    prisma.streamer.deleteMany(),
    prisma.preset.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.licenseKey.deleteMany(),
    prisma.device.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}
```

`packages/database/src/index.ts`:
```ts
export * from "./client";
export * from "./testUtils";
```

- [ ] **Step 6: Write and run the smoke test against the test database**

`packages/database/src/client.smoke.test.ts`:
```ts
import "dotenv/config";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../../.env.test"), override: true });

import { describe, it, expect, afterAll } from "vitest";
import { prisma, resetDatabase } from "./index";

describe("database connection", () => {
  it("connects and can run a raw query", async () => {
    const result = await prisma.$queryRaw`SELECT 1 as one`;
    expect(result).toEqual([{ one: 1 }]);
  });

  it("resetDatabase clears all rows without error", async () => {
    await prisma.user.create({ data: { email: "smoke@example.com", passwordHash: "x" } });
    await resetDatabase();
    const count = await prisma.user.count();
    expect(count).toBe(0);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
```

Run: `npm test -w @llz-clipper/database`
Expected: PASS (2 tests), connecting to `llz_clipper_test`.

- [ ] **Step 7: Commit**

```bash
git add packages/database package-lock.json .gitignore
git commit -m "feat(database): add Prisma schema, migrations, client, and test reset helper"
```

Note: `.env` and `.env.test` are gitignored and will not be committed — this is expected. Anyone re-cloning the repo must copy `.env.example` and fill in real values (documented in Task 13's README).

---

### Task 5: `services/api` — Fastify app scaffold, health check, JWT helper (TDD)

**Files:**
- Create: `services/api/package.json`
- Create: `services/api/tsconfig.json`
- Create: `services/api/vitest.config.ts`
- Create: `services/api/src/app.ts`
- Create: `services/api/src/server.ts`
- Create: `services/api/src/auth/jwt.ts`
- Create: `services/api/src/auth/jwt.test.ts`
- Create: `services/api/test/health.test.ts`
- Create: `services/api/test/env.ts`

**Interfaces:**
- Consumes: nothing from other tasks yet (this task only needs Node/Fastify).
- Produces: `buildApp(): FastifyInstance` (empty except `/health`, extended by every later `services/api` task), `signAccessToken(userId: string): string`, `verifyAccessToken(token: string): { sub: string }` — consumed by Tasks 6–11.

- [ ] **Step 1: Create the package and install dependencies**

`services/api/package.json`:
```json
{
  "name": "@llz-clipper/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "seed:admin": "tsx src/scripts/seedAdmin.ts"
  }
}
```

`services/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

Run (from repo root):
```bash
npm install -D typescript vitest tsx -w @llz-clipper/api
npm install fastify -w @llz-clipper/api
npm install @llz-clipper/types @llz-clipper/shared @llz-clipper/database -w @llz-clipper/api
```

- [ ] **Step 2: Configure Vitest to transpile the internal workspace packages**

`services/api/test/env.ts`:
```ts
import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(__dirname, "../../../.env.test"), override: true });
```

`services/api/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/env.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    server: {
      deps: {
        inline: [/@llz-clipper\//],
      },
    },
  },
});
```

Run: `npm install -D dotenv -w @llz-clipper/api`

- [ ] **Step 3: Write the failing JWT test**

`services/api/src/auth/jwt.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signAccessToken, verifyAccessToken } from "./jwt";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-6f2a9c";
});

describe("signAccessToken / verifyAccessToken", () => {
  it("round-trips a user id", () => {
    const token = signAccessToken("user-123");
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-123");
  });

  it("throws on a tampered token", () => {
    const token = signAccessToken("user-123");
    expect(() => verifyAccessToken(`${token}x`)).toThrow();
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm test -w @llz-clipper/api`
Expected: FAIL — `Cannot find module './jwt'`.

- [ ] **Step 5: Implement the JWT helper**

Run: `npm install jsonwebtoken -w @llz-clipper/api && npm install -D @types/jsonwebtoken -w @llz-clipper/api`

`services/api/src/auth/jwt.ts`:
```ts
import jwt from "jsonwebtoken";

export interface AccessTokenPayload {
  sub: string;
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET as string, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, process.env.JWT_SECRET as string) as AccessTokenPayload;
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm test -w @llz-clipper/api`
Expected: PASS (2 tests).

- [ ] **Step 7: Write the failing health check test**

`services/api/test/health.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";

let app: FastifyInstance;

beforeEach(async () => {
  app = buildApp();
  await app.ready();
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 8: Run to verify it fails**

Run: `npm test -w @llz-clipper/api`
Expected: FAIL — `Cannot find module '../src/app'`.

- [ ] **Step 9: Implement `app.ts` and `server.ts`**

`services/api/src/app.ts`:
```ts
import Fastify, { FastifyInstance } from "fastify";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
```

`services/api/src/server.ts`:
```ts
import "dotenv/config";
import { buildApp } from "./app";

const port = Number(process.env.PORT ?? 3000);
const app = buildApp();

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    console.log(`LLZ CLIPPER API rodando na porta ${port}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 10: Run to verify it passes**

Run: `npm test -w @llz-clipper/api`
Expected: PASS (3 tests total).

- [ ] **Step 11: Commit**

```bash
git add services/api package-lock.json
git commit -m "feat(api): scaffold Fastify app with health check and JWT helper"
```

---

### Task 6: Auth — key activation (TDD)

**Files:**
- Create: `services/api/src/services/tokenService.ts`
- Create: `services/api/src/services/expiry.ts`
- Create: `services/api/src/services/expiry.test.ts`
- Create: `services/api/src/services/licenseService.ts`
- Create: `services/api/src/routes/auth.routes.ts`
- Modify: `services/api/src/app.ts`
- Create: `services/api/test/auth.activateKey.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@llz-clipper/database` (Task 4), `generateOpaqueToken`/`hashToken` from `@llz-clipper/shared` (Task 3), `signAccessToken` from `./auth/jwt` (Task 5).
- Produces: `issueTokens(userId: string): Promise<{ accessToken: string; refreshToken: string }>`, `calculateExpiryDate(plan: "MONTHLY" | "QUARTERLY", from?: Date): Date`, `activateKey(input): Promise<{ user, key, tokens }>`, `LicenseError` class, `registerAuthRoutes(app: FastifyInstance): void` — the route registration function is reused and extended by Task 7.

- [ ] **Step 1: Install remaining dependencies**

Run: `npm install bcryptjs zod -w @llz-clipper/api && npm install -D @types/bcryptjs -w @llz-clipper/api`

- [ ] **Step 2: Write the failing test for `calculateExpiryDate`**

`services/api/src/services/expiry.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { calculateExpiryDate } from "./expiry";

describe("calculateExpiryDate", () => {
  it("adds 30 days for MONTHLY", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const result = calculateExpiryDate("MONTHLY", from);
    expect(result.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("adds 90 days for QUARTERLY", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const result = calculateExpiryDate("QUARTERLY", from);
    expect(result.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
});
```

- [ ] **Step 3: Run to verify it fails, then implement**

Run: `npm test -w @llz-clipper/api` — Expected: FAIL (`Cannot find module './expiry'`).

`services/api/src/services/expiry.ts`:
```ts
export function calculateExpiryDate(plan: "MONTHLY" | "QUARTERLY", from: Date = new Date()): Date {
  const days = plan === "MONTHLY" ? 30 : 90;
  const result = new Date(from);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
```

Run: `npm test -w @llz-clipper/api` — Expected: PASS.

- [ ] **Step 4: Implement the token service (no test file — pure plumbing exercised by Step 6's integration test)**

`services/api/src/services/tokenService.ts`:
```ts
import { prisma } from "@llz-clipper/database";
import { generateOpaqueToken, hashToken } from "@llz-clipper/shared";
import { signAccessToken } from "../auth/jwt";

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

export async function issueTokens(userId: string): Promise<IssuedTokens> {
  const accessToken = signAccessToken(userId);
  const refreshToken = generateOpaqueToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 30));

  await prisma.refreshToken.create({
    data: { tokenHash: hashToken(refreshToken), userId, expiresAt },
  });

  return { accessToken, refreshToken };
}
```

- [ ] **Step 5: Write the failing integration test for `POST /auth/activate-key`**

`services/api/test/auth.activateKey.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { buildApp } from "../src/app";

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  app = buildApp();
  await app.ready();
});

async function createUnusedKey(plan: "MONTHLY" | "QUARTERLY" = "MONTHLY") {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return prisma.licenseKey.create({ data: { code: `LLZ-TEST-${suffix}-0001`, plan } });
}

describe("POST /auth/activate-key", () => {
  it("activates an unused key and returns tokens", async () => {
    const key = await createUnusedKey("MONTHLY");

    const response = await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: key.code, email: "user@example.com", password: "supersecret123", hwid: "hwid-abc-123" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.user.email).toBe("user@example.com");

    const updatedKey = await prisma.licenseKey.findUnique({ where: { id: key.id } });
    expect(updatedKey?.status).toBe("ACTIVE");
    expect(updatedKey?.expiresAt).not.toBeNull();
  });

  it("rejects a key that does not exist", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: "LLZ-0000-0000-0000", email: "a@a.com", password: "supersecret123", hwid: "hwid-1" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("key_not_found");
  });

  it("rejects a revoked key", async () => {
    const key = await createUnusedKey();
    await prisma.licenseKey.update({ where: { id: key.id }, data: { status: "REVOKED" } });

    const response = await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: key.code, email: "a@a.com", password: "supersecret123", hwid: "hwid-1" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("key_revoked");
  });

  it("rejects an expired key", async () => {
    const key = await createUnusedKey();
    await prisma.licenseKey.update({ where: { id: key.id }, data: { status: "EXPIRED" } });

    const response = await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: key.code, email: "a@a.com", password: "supersecret123", hwid: "hwid-1" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("key_expired");
  });

  it("rejects a key that is already active, regardless of the email submitted", async () => {
    const key = await createUnusedKey();
    const owner = await prisma.user.create({ data: { email: "owner@example.com", passwordHash: "x" } });
    await prisma.licenseKey.update({ where: { id: key.id }, data: { status: "ACTIVE", userId: owner.id } });

    const response = await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: key.code, email: "someoneelse@example.com", password: "supersecret123", hwid: "hwid-2" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("key_already_linked");
  });

  it("sets expiresAt ~30 days out for MONTHLY and ~90 days out for QUARTERLY", async () => {
    const monthly = await createUnusedKey("MONTHLY");
    const quarterly = await createUnusedKey("QUARTERLY");
    const now = Date.now();

    await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: monthly.code, email: "m@example.com", password: "supersecret123", hwid: "hwid-m" },
    });
    await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: quarterly.code, email: "q@example.com", password: "supersecret123", hwid: "hwid-q" },
    });

    const updatedMonthly = await prisma.licenseKey.findUnique({ where: { id: monthly.id } });
    const updatedQuarterly = await prisma.licenseKey.findUnique({ where: { id: quarterly.id } });

    const monthlyDays = (updatedMonthly!.expiresAt!.getTime() - now) / 86_400_000;
    const quarterlyDays = (updatedQuarterly!.expiresAt!.getTime() - now) / 86_400_000;

    expect(monthlyDays).toBeGreaterThan(29);
    expect(monthlyDays).toBeLessThan(31);
    expect(quarterlyDays).toBeGreaterThan(89);
    expect(quarterlyDays).toBeLessThan(91);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -w @llz-clipper/api`
Expected: FAIL — route `/auth/activate-key` returns 404 (not registered yet).

- [ ] **Step 7: Implement `licenseService.ts` and `auth.routes.ts`, wire into `app.ts`**

`services/api/src/services/licenseService.ts`:
```ts
import { prisma } from "@llz-clipper/database";
import bcrypt from "bcryptjs";
import { calculateExpiryDate } from "./expiry";
import { issueTokens } from "./tokenService";

export class LicenseError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

interface ActivateKeyInput {
  code: string;
  email: string;
  password: string;
  hwid: string;
}

export async function activateKey(input: ActivateKeyInput) {
  const key = await prisma.licenseKey.findUnique({ where: { code: input.code } });

  if (!key) {
    throw new LicenseError(404, "key_not_found", "Key inválida");
  }
  if (key.status === "REVOKED") {
    throw new LicenseError(403, "key_revoked", "Key revogada");
  }
  if (key.status === "EXPIRED") {
    throw new LicenseError(403, "key_expired", "Key expirada");
  }
  if (key.status === "ACTIVE") {
    throw new LicenseError(409, "key_already_linked", "Key já vinculada a outra conta");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  let user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    user = await prisma.user.create({ data: { email: input.email, passwordHash } });
  }

  let device = await prisma.device.findUnique({ where: { hwid: input.hwid } });
  if (!device) {
    device = await prisma.device.create({ data: { hwid: input.hwid, userId: user.id } });
  }

  const expiresAt = calculateExpiryDate(key.plan);

  const updatedKey = await prisma.licenseKey.update({
    where: { id: key.id },
    data: { status: "ACTIVE", activatedAt: new Date(), expiresAt, userId: user.id, deviceId: device.id },
  });

  await prisma.usageLog.create({
    data: { userId: user.id, action: "key_activated", metadata: { keyId: updatedKey.id } },
  });

  const tokens = await issueTokens(user.id);

  return { user, key: updatedKey, tokens };
}
```

`services/api/src/routes/auth.routes.ts`:
```ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { activateKey, LicenseError } from "../services/licenseService";

const activateKeySchema = z.object({
  code: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  hwid: z.string().min(1),
});

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post("/activate-key", async (request, reply) => {
    const parsed = activateKeySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    }

    try {
      const { user, tokens } = await activateKey(parsed.data);
      return reply.code(201).send({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: { id: user.id, email: user.email, role: user.role },
      });
    } catch (err) {
      if (err instanceof LicenseError) {
        return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });
}
```

`services/api/src/app.ts` (modify):
```ts
import Fastify, { FastifyInstance } from "fastify";
import { registerAuthRoutes } from "./routes/auth.routes";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  app.register(
    async (authScope) => {
      registerAuthRoutes(authScope);
    },
    { prefix: "/auth" }
  );

  return app;
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npm test -w @llz-clipper/api`
Expected: PASS (all previous tests + 6 new ones).

- [ ] **Step 9: Commit**

```bash
git add services/api
git commit -m "feat(api): implement POST /auth/activate-key"
```

---

### Task 7: Auth — login, refresh, logout, me, and the `authenticate` middleware (TDD)

**Files:**
- Create: `services/api/src/services/authService.ts`
- Create: `services/api/src/middleware/authenticate.ts`
- Create: `services/api/src/types/fastify.d.ts`
- Modify: `services/api/src/routes/auth.routes.ts`
- Modify: `services/api/tsconfig.json` (ensure `src/types` is included — already covered by `include: ["src", "test"]`)
- Create: `services/api/test/auth.sessionFlow.test.ts`

**Interfaces:**
- Consumes: `issueTokens` (Task 6), `prisma` (Task 4), `hashToken` (Task 3), `verifyAccessToken` (Task 5).
- Produces: `login(email, password)`, `refresh(refreshToken)`, `logout(refreshToken)`, `AuthError` class, `authenticate` Fastify preHandler that sets `request.authUser: { id, email, role }` — consumed by Tasks 8, 9, 10.

- [ ] **Step 1: Declare the `request.authUser` type augmentation**

`services/api/src/types/fastify.d.ts`:
```ts
import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: {
      id: string;
      email: string;
      role: "USER" | "ADMIN";
    };
  }
}
```

- [ ] **Step 2: Write the failing session-flow test**

`services/api/test/auth.sessionFlow.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { buildApp } from "../src/app";

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  app = buildApp();
  await app.ready();
});

async function activate() {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const key = await prisma.licenseKey.create({ data: { code: `LLZ-SESS-${suffix}-0001`, plan: "MONTHLY" } });
  const response = await app.inject({
    method: "POST",
    url: "/auth/activate-key",
    payload: { code: key.code, email: "session@example.com", password: "supersecret123", hwid: "hwid-session" },
  });
  return response.json();
}

describe("POST /auth/login", () => {
  it("logs in with correct credentials after activation", async () => {
    await activate();
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "session@example.com", password: "supersecret123" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toBeDefined();
  });

  it("rejects an incorrect password", async () => {
    await activate();
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "session@example.com", password: "wrong-password" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("blocks login when the linked key has expired", async () => {
    await activate();
    await prisma.licenseKey.updateMany({ where: {}, data: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "session@example.com", password: "supersecret123" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("license_expired");

    const key = await prisma.licenseKey.findFirst();
    expect(key?.status).toBe("EXPIRED");
  });
});

describe("POST /auth/refresh and /auth/logout", () => {
  it("issues a new access token from a valid refresh token", async () => {
    const activated = await activate();
    const response = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: activated.refreshToken },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toBeDefined();
  });

  it("rejects a refresh token after logout", async () => {
    const activated = await activate();
    const logoutResponse = await app.inject({
      method: "POST",
      url: "/auth/logout",
      payload: { refreshToken: activated.refreshToken },
    });
    expect(logoutResponse.statusCode).toBe(204);

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: activated.refreshToken },
    });
    expect(refreshResponse.statusCode).toBe(401);
  });
});

describe("GET /auth/me", () => {
  it("returns the authenticated user", async () => {
    const activated = await activate();
    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${activated.accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe("session@example.com");
  });

  it("returns 403 once the linked key expires, even mid-session", async () => {
    const activated = await activate();
    await prisma.licenseKey.updateMany({ where: {}, data: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${activated.accessToken}` },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("license_expired");
  });

  it("returns 401 with no token", async () => {
    const response = await app.inject({ method: "GET", url: "/auth/me" });
    expect(response.statusCode).toBe(401);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w @llz-clipper/api`
Expected: FAIL — `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me` all 404.

- [ ] **Step 4: Implement `authService.ts` and `authenticate.ts`**

`services/api/src/services/authService.ts`:
```ts
import { prisma } from "@llz-clipper/database";
import bcrypt from "bcryptjs";
import { hashToken } from "@llz-clipper/shared";
import { issueTokens } from "./tokenService";

export class AuthError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { licenseKeys: { where: { status: "ACTIVE" } } },
  });

  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AuthError(401, "invalid_credentials", "Email ou senha inválidos");
  }

  const activeKey = user.licenseKeys[0];
  if (!activeKey) {
    throw new AuthError(403, "no_active_license", "Nenhuma licença ativa");
  }

  if (activeKey.expiresAt && activeKey.expiresAt.getTime() < Date.now()) {
    await prisma.licenseKey.update({ where: { id: activeKey.id }, data: { status: "EXPIRED" } });
    throw new AuthError(403, "license_expired", "Licença expirada");
  }

  await prisma.usageLog.create({ data: { userId: user.id, action: "login" } });

  const tokens = await issueTokens(user.id);
  return { ...tokens, user: { id: user.id, email: user.email, role: user.role } };
}

export async function refresh(refreshToken: string) {
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });

  if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
    throw new AuthError(401, "invalid_refresh_token", "Refresh token inválido ou expirado");
  }

  const { signAccessToken } = await import("../auth/jwt");
  return { accessToken: signAccessToken(stored.userId) };
}

export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
```

`services/api/src/middleware/authenticate.ts`:
```ts
import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@llz-clipper/database";
import { verifyAccessToken } from "../auth/jwt";

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "missing_token", message: "Token de acesso ausente" });
  }

  let payload: { sub: string };
  try {
    payload = verifyAccessToken(header.slice("Bearer ".length));
  } catch {
    return reply.code(401).send({ error: "invalid_token", message: "Token de acesso inválido ou expirado" });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { licenseKeys: { where: { status: "ACTIVE" } } },
  });

  if (!user) {
    return reply.code(401).send({ error: "invalid_token", message: "Usuário não encontrado" });
  }

  const activeKey = user.licenseKeys[0];
  if (!activeKey) {
    return reply.code(403).send({ error: "no_active_license", message: "Nenhuma licença ativa" });
  }

  if (activeKey.expiresAt && activeKey.expiresAt.getTime() < Date.now()) {
    await prisma.licenseKey.update({ where: { id: activeKey.id }, data: { status: "EXPIRED" } });
    return reply.code(403).send({ error: "license_expired", message: "Licença expirada" });
  }

  request.authUser = { id: user.id, email: user.email, role: user.role };
}
```

Fix the dynamic import in `authService.ts` — replace it with a top-level import for clarity and to avoid an unnecessary async import on every refresh call:

`services/api/src/services/authService.ts` (replace the `refresh` function and add the import):
```ts
import { signAccessToken } from "../auth/jwt";
```
(add this line to the top imports of `authService.ts`, alongside the existing ones)

```ts
export async function refresh(refreshToken: string) {
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });

  if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
    throw new AuthError(401, "invalid_refresh_token", "Refresh token inválido ou expirado");
  }

  return { accessToken: signAccessToken(stored.userId) };
}
```

- [ ] **Step 5: Wire the new routes into `auth.routes.ts`**

`services/api/src/routes/auth.routes.ts` (replace the full file):
```ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { activateKey, LicenseError } from "../services/licenseService";
import { login, refresh, logout, AuthError } from "../services/authService";
import { authenticate } from "../middleware/authenticate";

const activateKeySchema = z.object({
  code: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  hwid: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshOrLogoutSchema = z.object({ refreshToken: z.string().min(1) });

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post("/activate-key", async (request, reply) => {
    const parsed = activateKeySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    }
    try {
      const { user, tokens } = await activateKey(parsed.data);
      return reply.code(201).send({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: { id: user.id, email: user.email, role: user.role },
      });
    } catch (err) {
      if (err instanceof LicenseError) {
        return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    }
    try {
      const result = await login(parsed.data.email, parsed.data.password);
      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post("/refresh", async (request, reply) => {
    const parsed = refreshOrLogoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    }
    try {
      const result = await refresh(parsed.data.refreshToken);
      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post("/logout", async (request, reply) => {
    const parsed = refreshOrLogoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    }
    await logout(parsed.data.refreshToken);
    return reply.code(204).send();
  });

  app.get("/me", { preHandler: authenticate }, async (request, reply) => {
    return reply.code(200).send({ user: request.authUser });
  });
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm test -w @llz-clipper/api`
Expected: PASS (all previous + 9 new tests).

- [ ] **Step 7: Commit**

```bash
git add services/api
git commit -m "feat(api): implement login, refresh, logout, me, and the authenticate middleware"
```

---

### Task 8: Admin — `requireAdmin` middleware and key management endpoints (TDD)

**Files:**
- Create: `services/api/src/middleware/requireAdmin.ts`
- Create: `services/api/src/services/adminKeyService.ts`
- Create: `services/api/src/routes/admin.routes.ts`
- Modify: `services/api/src/app.ts`
- Create: `services/api/test/helpers.ts`
- Create: `services/api/test/admin.authorization.test.ts`
- Create: `services/api/test/admin.keys.test.ts`

**Interfaces:**
- Consumes: `authenticate` (Task 7), `generateKeyCode` (Task 3), `prisma` (Task 4).
- Produces: `requireAdmin` preHandler, `createKey`, `createKeysBulk`, `listKeys`, `revokeKey`, and the shared test helper `createAuthenticatedUser(role)` — reused by Tasks 9 and 10.

- [ ] **Step 1: Write the shared test helper**

`services/api/test/helpers.ts`:
```ts
import bcrypt from "bcryptjs";
import { prisma } from "@llz-clipper/database";
import { signAccessToken } from "../src/auth/jwt";

export async function createAuthenticatedUser(role: "USER" | "ADMIN" = "USER") {
  const passwordHash = await bcrypt.hash("supersecret123", 10);
  const email = `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const user = await prisma.user.create({ data: { email, passwordHash, role } });

  await prisma.licenseKey.create({
    data: {
      code: `LLZ-HLPR-${Math.random().toString(36).slice(2, 6).toUpperCase()}-0001`,
      plan: "MONTHLY",
      status: "ACTIVE",
      activatedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      userId: user.id,
    },
  });

  return { user, token: signAccessToken(user.id) };
}
```

- [ ] **Step 2: Write the failing authorization test**

`services/api/test/admin.authorization.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase } from "@llz-clipper/database";
import { buildApp } from "../src/app";
import { createAuthenticatedUser } from "./helpers";

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  app = buildApp();
  await app.ready();
});

describe("admin route authorization", () => {
  it("blocks a regular user with 403", async () => {
    const { token } = await createAuthenticatedUser("USER");
    const response = await app.inject({
      method: "GET",
      url: "/admin/keys",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("allows an admin user", async () => {
    const { token } = await createAuthenticatedUser("ADMIN");
    const response = await app.inject({
      method: "GET",
      url: "/admin/keys",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
  });

  it("blocks an unauthenticated request with 401", async () => {
    const response = await app.inject({ method: "GET", url: "/admin/keys" });
    expect(response.statusCode).toBe(401);
  });
});
```

- [ ] **Step 3: Write the failing key-management test**

`services/api/test/admin.keys.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { buildApp } from "../src/app";
import { createAuthenticatedUser } from "./helpers";

let app: FastifyInstance;
let adminToken: string;

beforeEach(async () => {
  await resetDatabase();
  app = buildApp();
  await app.ready();
  const admin = await createAuthenticatedUser("ADMIN");
  adminToken = admin.token;
});

describe("POST /admin/keys", () => {
  it("creates a single UNUSED key for the given plan", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { plan: "MONTHLY" },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.status).toBe("UNUSED");
    expect(body.plan).toBe("MONTHLY");
    expect(body.code).toMatch(/^LLZ-/);
  });
});

describe("POST /admin/keys/bulk", () => {
  it("creates the requested number of keys with unique codes", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/keys/bulk",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { plan: "QUARTERLY", count: 10 },
    });
    expect(response.statusCode).toBe(201);
    const keys = response.json();
    expect(keys).toHaveLength(10);
    expect(new Set(keys.map((k: { code: string }) => k.code)).size).toBe(10);
  });
});

describe("GET /admin/keys", () => {
  it("filters keys by status", async () => {
    await prisma.licenseKey.create({ data: { code: "LLZ-LIST-0001-0001", plan: "MONTHLY", status: "UNUSED" } });
    await prisma.licenseKey.create({ data: { code: "LLZ-LIST-0002-0002", plan: "MONTHLY", status: "REVOKED" } });

    const response = await app.inject({
      method: "GET",
      url: "/admin/keys?status=REVOKED",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].status).toBe("REVOKED");
  });
});

describe("POST /admin/keys/:id/revoke", () => {
  it("marks an active key as revoked", async () => {
    const key = await prisma.licenseKey.create({ data: { code: "LLZ-REVK-0001-0001", plan: "MONTHLY", status: "ACTIVE" } });
    const response = await app.inject({
      method: "POST",
      url: `/admin/keys/${key.id}/revoke`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("REVOKED");
  });

  it("returns 404 for a key that does not exist", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/keys/00000000-0000-0000-0000-000000000000/revoke",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm test -w @llz-clipper/api`
Expected: FAIL — `/admin/*` routes all 404.

- [ ] **Step 5: Implement `requireAdmin.ts`, `adminKeyService.ts`, `admin.routes.ts`, and wire into `app.ts`**

`services/api/src/middleware/requireAdmin.ts`:
```ts
import { FastifyRequest, FastifyReply } from "fastify";

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.authUser || request.authUser.role !== "ADMIN") {
    return reply.code(403).send({ error: "forbidden", message: "Acesso restrito a administradores" });
  }
}
```

`services/api/src/services/adminKeyService.ts`:
```ts
import { prisma } from "@llz-clipper/database";
import { generateKeyCode } from "@llz-clipper/shared";

type Plan = "MONTHLY" | "QUARTERLY";

async function generateUniqueKeyCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateKeyCode();
    const existing = await prisma.licenseKey.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("Não foi possível gerar um código de key único após várias tentativas");
}

export async function createKey(plan: Plan) {
  const code = await generateUniqueKeyCode();
  return prisma.licenseKey.create({ data: { code, plan } });
}

export async function createKeysBulk(plan: Plan, count: number) {
  const keys = [];
  for (let i = 0; i < count; i++) {
    keys.push(await createKey(plan));
  }
  return keys;
}

interface ListKeysFilters {
  search?: string;
  status?: string;
  plan?: string;
  page: number;
  pageSize: number;
}

export async function listKeys(filters: ListKeysFilters) {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.plan) where.plan = filters.plan;
  if (filters.search) where.code = { contains: filters.search, mode: "insensitive" };

  const [items, total] = await Promise.all([
    prisma.licenseKey.findMany({
      where,
      include: { user: true },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.licenseKey.count({ where }),
  ]);

  return { items, total, page: filters.page, pageSize: filters.pageSize };
}

export async function revokeKey(id: string) {
  return prisma.licenseKey.update({ where: { id }, data: { status: "REVOKED", revokedAt: new Date() } });
}
```

`services/api/src/routes/admin.routes.ts`:
```ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@llz-clipper/database";
import { createKey, createKeysBulk, listKeys, revokeKey } from "../services/adminKeyService";

const planSchema = z.enum(["MONTHLY", "QUARTERLY"]);
const createKeySchema = z.object({ plan: planSchema });
const createKeyBulkSchema = z.object({ plan: planSchema, count: z.number().int().min(1).max(500) });

export function registerAdminRoutes(app: FastifyInstance): void {
  app.post("/keys", async (request, reply) => {
    const parsed = createKeySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    const key = await createKey(parsed.data.plan);
    return reply.code(201).send(key);
  });

  app.post("/keys/bulk", async (request, reply) => {
    const parsed = createKeyBulkSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    const keys = await createKeysBulk(parsed.data.plan, parsed.data.count);
    return reply.code(201).send(keys);
  });

  app.get("/keys", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const result = await listKeys({
      search: query.search,
      status: query.status,
      plan: query.plan,
      page: Number(query.page ?? 1),
      pageSize: Number(query.pageSize ?? 20),
    });
    return reply.code(200).send(result);
  });

  app.post("/keys/:id/revoke", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.licenseKey.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "key_not_found", message: "Key não encontrada" });
    const key = await revokeKey(id);
    return reply.code(200).send(key);
  });
}
```

`services/api/src/app.ts` (replace the full file):
```ts
import Fastify, { FastifyInstance } from "fastify";
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerAdminRoutes } from "./routes/admin.routes";
import { authenticate } from "./middleware/authenticate";
import { requireAdmin } from "./middleware/requireAdmin";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  app.register(
    async (authScope) => {
      registerAuthRoutes(authScope);
    },
    { prefix: "/auth" }
  );

  app.register(
    async (adminScope) => {
      adminScope.addHook("preHandler", authenticate);
      adminScope.addHook("preHandler", requireAdmin);
      registerAdminRoutes(adminScope);
    },
    { prefix: "/admin" }
  );

  return app;
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm test -w @llz-clipper/api`
Expected: PASS (all previous + 7 new tests).

- [ ] **Step 7: Commit**

```bash
git add services/api
git commit -m "feat(api): implement admin key management endpoints with role-gated access"
```

---

### Task 9: Admin — usage logs endpoint (TDD)

**Files:**
- Modify: `services/api/src/routes/admin.routes.ts`
- Create: `services/api/test/admin.logs.test.ts`

**Interfaces:**
- Consumes: `prisma.usageLog` (already populated by `activateKey` and `login` from Tasks 6–7).
- Produces: `GET /admin/logs` route, no new exported functions.

- [ ] **Step 1: Write the failing test**

`services/api/test/admin.logs.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { buildApp } from "../src/app";
import { createAuthenticatedUser } from "./helpers";

let app: FastifyInstance;
let adminToken: string;

beforeEach(async () => {
  await resetDatabase();
  app = buildApp();
  await app.ready();
  const admin = await createAuthenticatedUser("ADMIN");
  adminToken = admin.token;
});

describe("GET /admin/logs", () => {
  it("records a usage log entry when a key is activated", async () => {
    const key = await prisma.licenseKey.create({ data: { code: "LLZ-LOGS-0001-0001", plan: "MONTHLY" } });
    await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: key.code, email: "logtest@example.com", password: "supersecret123", hwid: "hwid-log" },
    });

    const response = await app.inject({
      method: "GET",
      url: "/admin/logs?action=key_activated",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items[0].action).toBe("key_activated");
  });

  it("filters by userId", async () => {
    const { user } = await createAuthenticatedUser("USER");
    const response = await app.inject({
      method: "GET",
      url: `/admin/logs?userId=${user.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    for (const item of response.json().items) {
      expect(item.userId).toBe(user.id);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @llz-clipper/api`
Expected: FAIL — `/admin/logs` returns 404.

- [ ] **Step 3: Implement the route**

`services/api/src/routes/admin.routes.ts` — add this handler inside `registerAdminRoutes`, after the `/keys/:id/revoke` handler:
```ts
  app.get("/logs", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const where: Record<string, unknown> = {};
    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = query.action;

    const [items, total] = await Promise.all([
      prisma.usageLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.usageLog.count({ where }),
    ]);

    return reply.code(200).send({ items, total, page, pageSize });
  });
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @llz-clipper/api`
Expected: PASS (all previous + 2 new tests).

- [ ] **Step 5: Commit**

```bash
git add services/api
git commit -m "feat(api): implement GET /admin/logs"
```

---

### Task 10: Streamers CRUD (TDD)

**Files:**
- Create: `services/api/src/services/streamerService.ts`
- Create: `services/api/src/routes/streamers.routes.ts`
- Modify: `services/api/src/app.ts`
- Create: `services/api/test/streamers.crud.test.ts`

**Interfaces:**
- Consumes: `authenticate` (Task 7), `prisma` (Task 4).
- Produces: `listStreamers`, `createStreamer`, `getStreamer`, `updateStreamer`, `deleteStreamer` — not consumed by later Fase 1 tasks, but will be the integration point for Fase 3's VOD endpoints.

- [ ] **Step 1: Write the failing test**

`services/api/test/streamers.crud.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase } from "@llz-clipper/database";
import { buildApp } from "../src/app";
import { createAuthenticatedUser } from "./helpers";

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  app = buildApp();
  await app.ready();
});

describe("Streamers CRUD", () => {
  it("creates and lists a streamer for the authenticated user", async () => {
    const { token } = await createAuthenticatedUser("USER");

    const createResponse = await app.inject({
      method: "POST",
      url: "/streamers",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "DiParis7k", username: "diparis7k" },
    });
    expect(createResponse.statusCode).toBe(201);

    const listResponse = await app.inject({
      method: "GET",
      url: "/streamers",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toHaveLength(1);
  });

  it("does not let a user see another user's streamer", async () => {
    const owner = await createAuthenticatedUser("USER");
    const stranger = await createAuthenticatedUser("USER");

    const created = await app.inject({
      method: "POST",
      url: "/streamers",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: "OwnerStreamer", username: "owner" },
    });
    const streamerId = created.json().id;

    const response = await app.inject({
      method: "GET",
      url: `/streamers/${streamerId}`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    expect(response.statusCode).toBe(404);
  });

  it("updates and deletes a streamer", async () => {
    const { token } = await createAuthenticatedUser("USER");
    const created = await app.inject({
      method: "POST",
      url: "/streamers",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Name", username: "user" },
    });
    const id = created.json().id;

    const updateResponse = await app.inject({
      method: "PUT",
      url: `/streamers/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "New Name" },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().name).toBe("New Name");

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/streamers/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleteResponse.statusCode).toBe(204);

    const getResponse = await app.inject({
      method: "GET",
      url: `/streamers/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getResponse.statusCode).toBe(404);
  });

  it("rejects unauthenticated requests", async () => {
    const response = await app.inject({ method: "GET", url: "/streamers" });
    expect(response.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @llz-clipper/api`
Expected: FAIL — `/streamers` routes all 404.

- [ ] **Step 3: Implement `streamerService.ts`, `streamers.routes.ts`, and wire into `app.ts`**

`services/api/src/services/streamerService.ts`:
```ts
import { prisma } from "@llz-clipper/database";

interface StreamerInput {
  name: string;
  username: string;
  logoUrl?: string;
  watermark?: Record<string, unknown>;
  presetId?: string;
}

export async function listStreamers(userId: string) {
  return prisma.streamer.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export async function createStreamer(userId: string, input: StreamerInput) {
  return prisma.streamer.create({
    data: {
      userId,
      name: input.name,
      username: input.username,
      logoUrl: input.logoUrl,
      watermark: input.watermark,
      presetId: input.presetId,
    },
  });
}

export async function getStreamer(userId: string, id: string) {
  const streamer = await prisma.streamer.findUnique({ where: { id } });
  if (!streamer || streamer.userId !== userId) return null;
  return streamer;
}

export async function updateStreamer(userId: string, id: string, input: Partial<StreamerInput>) {
  const existing = await getStreamer(userId, id);
  if (!existing) return null;
  return prisma.streamer.update({ where: { id }, data: input });
}

export async function deleteStreamer(userId: string, id: string): Promise<boolean> {
  const existing = await getStreamer(userId, id);
  if (!existing) return false;
  await prisma.streamer.delete({ where: { id } });
  return true;
}
```

`services/api/src/routes/streamers.routes.ts`:
```ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  listStreamers,
  createStreamer,
  getStreamer,
  updateStreamer,
  deleteStreamer,
} from "../services/streamerService";

const createStreamerSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(1),
  logoUrl: z.string().url().optional(),
  watermark: z.record(z.unknown()).optional(),
  presetId: z.string().optional(),
});

const updateStreamerSchema = createStreamerSchema.partial();

export function registerStreamerRoutes(app: FastifyInstance): void {
  app.get("/", async (request, reply) => {
    const streamers = await listStreamers(request.authUser!.id);
    return reply.code(200).send(streamers);
  });

  app.post("/", async (request, reply) => {
    const parsed = createStreamerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    const streamer = await createStreamer(request.authUser!.id, parsed.data);
    return reply.code(201).send(streamer);
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const streamer = await getStreamer(request.authUser!.id, id);
    if (!streamer) return reply.code(404).send({ error: "not_found", message: "Streamer não encontrado" });
    return reply.code(200).send(streamer);
  });

  app.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateStreamerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    const streamer = await updateStreamer(request.authUser!.id, id, parsed.data);
    if (!streamer) return reply.code(404).send({ error: "not_found", message: "Streamer não encontrado" });
    return reply.code(200).send(streamer);
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await deleteStreamer(request.authUser!.id, id);
    if (!deleted) return reply.code(404).send({ error: "not_found", message: "Streamer não encontrado" });
    return reply.code(204).send();
  });
}
```

`services/api/src/app.ts` (replace the full file):
```ts
import Fastify, { FastifyInstance } from "fastify";
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerAdminRoutes } from "./routes/admin.routes";
import { registerStreamerRoutes } from "./routes/streamers.routes";
import { authenticate } from "./middleware/authenticate";
import { requireAdmin } from "./middleware/requireAdmin";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  app.register(
    async (authScope) => {
      registerAuthRoutes(authScope);
    },
    { prefix: "/auth" }
  );

  app.register(
    async (adminScope) => {
      adminScope.addHook("preHandler", authenticate);
      adminScope.addHook("preHandler", requireAdmin);
      registerAdminRoutes(adminScope);
    },
    { prefix: "/admin" }
  );

  app.register(
    async (streamerScope) => {
      streamerScope.addHook("preHandler", authenticate);
      registerStreamerRoutes(streamerScope);
    },
    { prefix: "/streamers" }
  );

  return app;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @llz-clipper/api`
Expected: PASS (all previous + 4 new tests).

- [ ] **Step 5: Commit**

```bash
git add services/api
git commit -m "feat(api): implement streamers CRUD with per-user isolation"
```

---

### Task 11: Rate limiting on `/auth` and `/admin` (TDD)

**Files:**
- Modify: `services/api/src/app.ts`
- Create: `services/api/test/rateLimit.test.ts`

**Interfaces:**
- Consumes: `buildApp` (Task 5, extended through Task 10).
- Produces: no new exports — this task only adds `@fastify/rate-limit` registration to the existing `authScope`/`adminScope` plugin encapsulations.

- [ ] **Step 1: Install the dependency**

Run: `npm install @fastify/rate-limit -w @llz-clipper/api`

- [ ] **Step 2: Write the failing test**

`services/api/test/rateLimit.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase } from "@llz-clipper/database";
import { buildApp } from "../src/app";

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  app = buildApp();
  await app.ready();
});

describe("rate limiting on /auth routes", () => {
  it("returns 429 after exceeding the configured limit within the window", async () => {
    let lastStatus = 0;
    for (let i = 0; i < 25; i++) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "nobody@example.com", password: "wrong" },
      });
      lastStatus = response.statusCode;
    }
    expect(lastStatus).toBe(429);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w @llz-clipper/api`
Expected: FAIL — the 25th request still returns 401, not 429.

- [ ] **Step 4: Implement rate limiting**

`services/api/src/app.ts` (replace the full file):
```ts
import Fastify, { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerAdminRoutes } from "./routes/admin.routes";
import { registerStreamerRoutes } from "./routes/streamers.routes";
import { authenticate } from "./middleware/authenticate";
import { requireAdmin } from "./middleware/requireAdmin";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  app.register(
    async (authScope) => {
      await authScope.register(rateLimit, { max: 20, timeWindow: "1 minute" });
      registerAuthRoutes(authScope);
    },
    { prefix: "/auth" }
  );

  app.register(
    async (adminScope) => {
      await adminScope.register(rateLimit, { max: 30, timeWindow: "1 minute" });
      adminScope.addHook("preHandler", authenticate);
      adminScope.addHook("preHandler", requireAdmin);
      registerAdminRoutes(adminScope);
    },
    { prefix: "/admin" }
  );

  app.register(
    async (streamerScope) => {
      streamerScope.addHook("preHandler", authenticate);
      registerStreamerRoutes(streamerScope);
    },
    { prefix: "/streamers" }
  );

  return app;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -w @llz-clipper/api`
Expected: PASS. Note: this adds ~25 requests per test run against `/auth/login`; if any earlier test in the same file/process now hits 429 unexpectedly because of cumulative counting within the same `timeWindow`, that is a sign the rate limiter state is leaking across tests — since each test's `beforeEach` calls `buildApp()` fresh, a new in-memory store is created per test and this will not happen. If it does happen, verify `beforeEach` is indeed rebuilding `app` for every test in the file.

- [ ] **Step 6: Commit**

```bash
git add services/api
git commit -m "feat(api): add rate limiting to /auth and /admin routes"
```

---

### Task 12: `seed:admin` script (TDD)

**Files:**
- Create: `services/api/src/services/seedAdminService.ts`
- Create: `services/api/test/seedAdminService.test.ts`
- Create: `services/api/src/scripts/seedAdmin.ts`

**Interfaces:**
- Consumes: `prisma` (Task 4).
- Produces: `seedAdmin(email: string, password: string): Promise<User>` — consumed only by the CLI script `src/scripts/seedAdmin.ts`.

- [ ] **Step 1: Write the failing test**

`services/api/test/seedAdminService.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { seedAdmin } from "../src/services/seedAdminService";

beforeEach(async () => {
  await resetDatabase();
});

describe("seedAdmin", () => {
  it("creates a new user with role ADMIN", async () => {
    const user = await seedAdmin("admin@example.com", "supersecret123");
    expect(user.role).toBe("ADMIN");

    const stored = await prisma.user.findUnique({ where: { email: "admin@example.com" } });
    expect(stored?.role).toBe("ADMIN");
  });

  it("promotes an existing user to ADMIN without touching their password hash", async () => {
    await prisma.user.create({ data: { email: "existing@example.com", passwordHash: "original-hash", role: "USER" } });
    const user = await seedAdmin("existing@example.com", "ignored-password");
    expect(user.role).toBe("ADMIN");
    expect(user.passwordHash).toBe("original-hash");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @llz-clipper/api`
Expected: FAIL — `Cannot find module '../src/services/seedAdminService'`.

- [ ] **Step 3: Implement `seedAdminService.ts` and the CLI wrapper**

`services/api/src/services/seedAdminService.ts`:
```ts
import bcrypt from "bcryptjs";
import { prisma } from "@llz-clipper/database";

export async function seedAdmin(email: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN" },
    create: { email, passwordHash, role: "ADMIN" },
  });
}
```

`services/api/src/scripts/seedAdmin.ts`:
```ts
import "dotenv/config";
import { prisma } from "@llz-clipper/database";
import { seedAdmin } from "../services/seedAdminService";

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const email = getArg("email");
  const password = getArg("password");

  if (!email || !password) {
    console.error("Uso: npm run seed:admin -- --email=admin@exemplo.com --password=senha-forte");
    process.exit(1);
  }

  const user = await seedAdmin(email, password);
  console.log(`Usuário admin pronto: ${user.email} (id: ${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @llz-clipper/api`
Expected: PASS (all previous + 2 new tests).

- [ ] **Step 5: Manually verify the CLI script against the dev database**

Run: `cd services/api && npx dotenv -e ../../.env -- npm run seed:admin -- --email=admin@llzclipper.local --password=ChangeMe123!`
Expected: prints `Usuário admin pronto: admin@llzclipper.local (id: <uuid>)`. (If `dotenv-cli` is not yet a dependency of `services/api`, run `npm install -D dotenv-cli -w @llz-clipper/api` first.)

- [ ] **Step 6: Commit**

```bash
git add services/api
git commit -m "feat(api): add seed:admin script for creating/promoting admin users"
```

---

### Task 13: Full test suite verification, typecheck, and README

**Files:**
- Modify: `README.md` (root)

**Interfaces:**
- Consumes: everything from Tasks 1–12.
- Produces: nothing new — this is the final verification and documentation pass for the phase.

- [ ] **Step 1: Run the full test suite from the repo root**

Run: `cd "/c/Users/Administrador/Downloads/LLZ-CLIPPER" && npm test`
Expected: every workspace's tests pass (`@llz-clipper/shared`, `@llz-clipper/database`, `@llz-clipper/api`), 0 failures.

- [ ] **Step 2: Run typecheck across workspaces**

Run: `npm run typecheck`
Expected: exits 0 for `@llz-clipper/types`, `@llz-clipper/shared`, `@llz-clipper/database`, `@llz-clipper/api`. Fix any type error surfaced here before proceeding (none are expected if every prior task's code was copied verbatim).

- [ ] **Step 3: Write the full root README**

`README.md`:
```markdown
# LLZ CLIPPER

Aplicativo Windows para transformar VODs de streamers em clips verticais
editados automaticamente. Este repositório contém a **Fase 1 (Fundação)**:
monorepo, banco de dados, autenticação, licenciamento por key e
administração. O app desktop e o pipeline de IA/FFmpeg são fases
posteriores — ver `docs/superpowers/specs/`.

## Requisitos

- Node.js 22+
- PostgreSQL 16 (rodando localmente ou acessível via `DATABASE_URL`)

## Setup

```bash
npm install
cp .env.example .env
# edite .env com a DATABASE_URL e um JWT_SECRET reais
```

Crie o banco e o usuário de aplicação (ajuste credenciais conforme seu ambiente):

```sql
CREATE DATABASE llz_clipper;
CREATE USER llz_app WITH PASSWORD 'sua-senha';
GRANT ALL PRIVILEGES ON DATABASE llz_clipper TO llz_app;
```

Rode as migrations:

```bash
cd packages/database
npx prisma migrate deploy
```

## Rodando a API

```bash
npm run dev -w @llz-clipper/api
```

A API sobe em `http://localhost:3000` (ou a porta definida em `PORT`).

## Testes

Os testes de integração rodam contra um banco de dados real
`llz_clipper_test` (não contra mocks). Crie-o da mesma forma que o banco de
desenvolvimento, aponte `DATABASE_URL` em `.env.test` para ele, e rode:

```bash
npm test
```

## Criando o primeiro administrador

```bash
cd services/api
npx dotenv -e ../../.env -- npm run seed:admin -- --email=admin@seudominio.com --password=senha-forte
```

Isso cria (ou promove) um usuário para `role = ADMIN`. Um admin pode gerar
keys via `POST /admin/keys` e `POST /admin/keys/bulk`.

## Gerando uma key de teste

Com um usuário admin autenticado (`POST /auth/login` para obter um
`accessToken`), chame:

```bash
curl -X POST http://localhost:3000/admin/keys \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"plan":"MONTHLY"}'
```

A resposta traz o `code` (`LLZ-XXXX-XXXX-XXXX`) a ser usado em
`POST /auth/activate-key`.

## Estrutura

```
apps/desktop/       # Fase 2 — placeholder
services/api/        # API Fastify (auth, licenciamento, admin, streamers)
services/worker/      # Fase 3 — placeholder
packages/database/   # Schema Prisma, migrations, client compartilhado
packages/shared/     # Geração de key code, hashing de tokens
packages/types/      # DTOs compartilhados da API
docs/superpowers/     # Specs e planos de implementação
```

## O que NÃO está implementado nesta fase

- App desktop (Tauri) — Fase 2
- Upload de VOD, sistema de jobs, FFmpeg — Fase 3
- Transcrição, análise de áudio/vídeo, detecção de contexto, scoring — Fase 4
- Editor, preview, render, export — Fase 5
- Device-lock / limite de dispositivos por key, renovação de key — schema
  preparado, sem endpoint ainda
```

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/Administrador/Downloads/LLZ-CLIPPER"
git add README.md
git commit -m "docs: add setup, testing, and admin seeding instructions to README"
```

---

## Self-Review

**Spec coverage:**
- §5 Login screen flow (activate-key) → Task 6 ✅
- §6 Key system (fields, statuses, plans) → Task 4 schema + Task 6/8 logic ✅
- §7 Security (backend-only validation, no secrets in client, sessions, refresh, logout, revocation) → Tasks 5–8, 11 ✅
- §8 Admin (generate key, bulk, search, revoke, view logs) → Tasks 8–9 ✅
- §9 Database entities and relationships → Task 4 (full schema, including out-of-scope models for future phases) ✅
- §39 Auth/Streamers/Admin endpoints listed in the spec → Tasks 6, 7, 8, 9, 10 (VOD/Jobs/Clips/Renders endpoints explicitly excluded per Global Constraints) ✅
- §46 Security checklist (auth, authorization, sessions, refresh, rate limiting, admin middleware, logs, secrets in backend) → Tasks 5–9, 11 ✅
- §47 Tests (license validation/expiration/revocation, admin authorization, job transitions*) → Tasks 6–10 (*Job transitions are out of scope for Fase 1 per the spec's own phase breakdown — no Job endpoints exist yet to transition) ✅
- §48 `.env.example` → Task 1 ✅
- §50 README (setup, admin creation, key generation) → Task 13 ✅

**Placeholder scan:** no TBD/TODO markers; every step has literal file content and literal shell commands.

**Type consistency:** `AuthUser`/`LicenseError`/`AuthError` shapes, `issueTokens` return type, and `request.authUser` shape are defined once (Tasks 5–7) and reused identically in Tasks 8–10 without renaming.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-27-llz-clipper-fase1-fundacao.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
