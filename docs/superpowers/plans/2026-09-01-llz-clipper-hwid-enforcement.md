# LLZ CLIPPER — HWID Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock a license key to exactly one device end-to-end — not just at activation (which already binds `LicenseKey.deviceId`), but on every subsequent login too, since `POST /auth/login` currently ignores HWID entirely.

**Architecture:** `POST /auth/login` starts requiring `hwid` in its body (mirroring `POST /auth/activate-key`, which already requires it). `authService.login()` checks the caller's active key: if it has no `deviceId` yet (never really activated, or just reset by an admin), bind the given `hwid` now and proceed; if it has a `deviceId` and the bound `Device.hwid` matches, proceed; if it doesn't match, reject with `403 hwid_mismatch` before issuing any token. A new admin-only `POST /admin/keys/:id/reset-device` clears `LicenseKey.deviceId`, giving a legitimate way to unlock a key for a new machine. The desktop's `useAuth.ts`'s `login()` starts calling `invoke("get_hwid")` the same way `activate()` already does, and a new "Resetar dispositivo" button appears next to "Revogar" in the admin key table.

**Tech Stack:** TypeScript, Fastify 5, Zod, Prisma 6.19.3, PostgreSQL 16, React 19, Vitest, `@tauri-apps/api/core`'s `invoke` (already used for `get_hwid` in `activate()`).

**Spec:** `docs/superpowers/specs/2026-09-01-llz-clipper-hwid-enforcement-design.md`

## Global Constraints

- No new Prisma migration. `Device` (unique `hwid`) and `LicenseKey.deviceId` already exist exactly as needed in `packages/database/prisma/schema.prisma` — do not edit `schema.prisma`, do not run `prisma migrate`.
- HWID is checked only at login. `POST /auth/refresh` is untouched — a token issued by a successful login stays valid for its normal lifetime regardless of any later device reset.
- Resetting a device does not revoke any existing refresh/access tokens. It only changes what the *next* login requires.
- Device reset is admin-only — there is no self-service "unlink my device" action anywhere in this plan.
- Real Postgres test database in every API test — no mocking Prisma, matching the existing `resetDatabase()`-based style used throughout `services/api/test/`.
- All new user-facing desktop strings (button labels, error messages) are in pt-BR, matching the rest of the app. The `hwid_mismatch` error message is exactly: `"Esta licença já está em uso em outro dispositivo."`
- `services/api/test/helpers.ts`'s `createAuthenticatedUser()` signs a JWT directly and never calls `/auth/login` — none of the ~90 existing API tests that use it are affected by making `hwid` required on login.

---

### Task 1: `services/api` — require and enforce `hwid` on `POST /auth/login`

**Files:**
- Modify: `services/api/src/routes/auth.routes.ts:14-17` (`loginSchema`)
- Modify: `services/api/src/services/authService.ts:17-41` (`login`)
- Test: `services/api/test/auth.sessionFlow.test.ts`

**Interfaces:**
- Produces: `login(email: string, password: string, hwid: string)` — the new third parameter. `authService.login`'s return shape is unchanged (`{ accessToken, refreshToken, user }`). The route handler passes `parsed.data.hwid` through as the third argument.
- Consumes: `prisma.device.findUnique`/`prisma.device.create` (same calls already used in `licenseService.ts`'s `activateKey`, lines 46-49) and `prisma.licenseKey.update`.

- [ ] **Step 1: Read the current files first**

Read `services/api/src/routes/auth.routes.ts` and `services/api/src/services/authService.ts` in full, and `services/api/src/services/licenseService.ts` lines 46-49 (the existing device find-or-create pattern from `activateKey`) to match its exact style. Read `services/api/test/auth.sessionFlow.test.ts` in full — the three existing `describe("POST /auth/login")` tests all call `/auth/login` without `hwid` in the payload, and will need updating in this task.

- [ ] **Step 2: Update the three existing login tests to send `hwid`, and write the new failing tests**

In `services/api/test/auth.sessionFlow.test.ts`, add `import bcrypt from "bcryptjs";` to the top imports (needed by the new "binds the device" test below). Update the existing `describe("POST /auth/login")` block's three tests to add `hwid: "hwid-session"` to each payload (matching the `hwid` already used in the file's `activate()` helper at line 20), then add these new tests to the same `describe` block:

```ts
  it("rejects a login request with no hwid", async () => {
    await activate();
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "session@example.com", password: "supersecret123" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_body");
  });

  it("binds the device on first login when the key has no device yet (e.g. a directly-seeded key)", async () => {
    const passwordHash = await bcrypt.hash("supersecret123", 10);
    const user = await prisma.user.create({ data: { email: "nodevice@example.com", passwordHash } });
    await prisma.licenseKey.create({
      data: {
        code: "LLZ-NODV-0001-0001",
        plan: "MONTHLY",
        status: "ACTIVE",
        activatedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        userId: user.id,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nodevice@example.com", password: "supersecret123", hwid: "hwid-first-bind" },
    });

    expect(response.statusCode).toBe(200);
    const key = await prisma.licenseKey.findFirst({ where: { userId: user.id }, include: { device: true } });
    expect(key?.device?.hwid).toBe("hwid-first-bind");
  });

  it("allows a second login from the same hwid the key is already bound to", async () => {
    await activate();
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "session@example.com", password: "supersecret123", hwid: "hwid-session" },
    });
    expect(response.statusCode).toBe(200);
  });

  it("rejects a login from a different hwid than the one the key is bound to", async () => {
    await activate();
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "session@example.com", password: "supersecret123", hwid: "some-other-machine" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("hwid_mismatch");
    expect(response.json().message).toBe("Esta licença já está em uso em outro dispositivo.");
  });
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npm test -w @llz-clipper/api -- test/auth.sessionFlow.test.ts`
Expected: the 3 pre-existing login tests still PASS unchanged (adding `hwid` to their payload is harmless before the schema requires it — the field is just ignored by Zod). Of the 4 new tests: "allows a second login from the same hwid..." PASSES trivially (login already succeeds for any hwid value today, since nothing checks it yet). The other 3 FAIL: "rejects a login request with no hwid" gets 200 instead of the expected 400 (nothing validates it yet); "binds the device on first login..." gets 200 but `key?.device?.hwid` is `undefined` instead of `"hwid-first-bind"` (nothing binds a device yet); "rejects a login from a different hwid" gets 200 instead of the expected 403 (nothing checks it yet). Steps 4-5 make all 4 pass together.

- [ ] **Step 4: Add `hwid` to the login schema**

In `services/api/src/routes/auth.routes.ts`, change:

```ts
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
```

to:

```ts
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  hwid: z.string().min(1),
});
```

And update the route handler's call from `login(parsed.data.email, parsed.data.password)` to `login(parsed.data.email, parsed.data.password, parsed.data.hwid)`.

- [ ] **Step 5: Implement the enforcement logic in `authService.login`**

In `services/api/src/services/authService.ts`, change the signature and add the device check between finding `activeKey` and the expiry check:

```ts
export async function login(email: string, password: string, hwid: string) {
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

  if (activeKey.deviceId === null) {
    let device = await prisma.device.findUnique({ where: { hwid } });
    if (!device) {
      device = await prisma.device.create({ data: { hwid, userId: user.id } });
    }
    await prisma.licenseKey.update({ where: { id: activeKey.id }, data: { deviceId: device.id } });
  } else {
    const device = await prisma.device.findUnique({ where: { id: activeKey.deviceId } });
    if (device?.hwid !== hwid) {
      throw new AuthError(403, "hwid_mismatch", "Esta licença já está em uso em outro dispositivo.");
    }
  }

  await prisma.usageLog.create({ data: { userId: user.id, action: "login" } });

  const tokens = await issueTokens(user.id);
  return { ...tokens, user: { id: user.id, email: user.email, role: user.role } };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w @llz-clipper/api -- test/auth.sessionFlow.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 7: Run the full API test suite to confirm nothing else broke**

Run: `npm test -w @llz-clipper/api`
Expected: PASS, every test file (confirms `createAuthenticatedUser`-based tests, which never call `/auth/login`, are unaffected).

- [ ] **Step 8: Commit**

```bash
git add services/api/src/routes/auth.routes.ts services/api/src/services/authService.ts services/api/test/auth.sessionFlow.test.ts
git commit -m "feat(api): require and enforce hwid on POST /auth/login"
```

---

### Task 2: `services/api` — `POST /admin/keys/:id/reset-device`

**Files:**
- Modify: `services/api/src/services/adminKeyService.ts`
- Modify: `services/api/src/routes/admin.routes.ts`
- Test: `services/api/test/admin.keys.test.ts`

**Interfaces:**
- Produces: `resetDeviceForKey(id: string): Promise<LicenseKey>` in `adminKeyService.ts` — mirrors the existing `revokeKey(id)` in the same file (same return type, same "just call `prisma.licenseKey.update`" shape). Route: `POST /admin/keys/:id/reset-device`, `200` with the updated key on success, `404 key_not_found` if the key doesn't exist (mirroring the existing `/keys/:id/revoke` route's 404 handling in `admin.routes.ts:37-43`).

- [ ] **Step 1: Read the current files first**

Read `services/api/src/services/adminKeyService.ts` and `services/api/src/routes/admin.routes.ts` in full, and `services/api/test/admin.keys.test.ts` in full to match its exact `describe`/test style (the existing `describe("POST /admin/keys/:id/revoke")` block, lines 67-87, is the direct template).

- [ ] **Step 2: Write the failing tests**

Add to `services/api/test/admin.keys.test.ts`, after the existing `describe("POST /admin/keys/:id/revoke")` block:

```ts
describe("POST /admin/keys/:id/reset-device", () => {
  it("clears the device binding on an active key", async () => {
    const owner = await prisma.user.create({ data: { email: `owner-${Date.now()}@example.com`, passwordHash: "x" } });
    const device = await prisma.device.create({ data: { hwid: "hwid-reset-test", userId: owner.id } });
    const key = await prisma.licenseKey.create({
      data: { code: "LLZ-RSET-0001-0001", plan: "MONTHLY", status: "ACTIVE", deviceId: device.id },
    });

    const response = await app.inject({
      method: "POST",
      url: `/admin/keys/${key.id}/reset-device`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().deviceId).toBeNull();

    const updated = await prisma.licenseKey.findUnique({ where: { id: key.id } });
    expect(updated?.deviceId).toBeNull();
  });

  it("returns 404 for a key that does not exist", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/keys/00000000-0000-0000-0000-000000000000/reset-device",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(404);
  });

  it("actually unblocks a login from a different device after reset", async () => {
    const key = await prisma.licenseKey.create({ data: { code: "LLZ-RSE2-0001-0001", plan: "MONTHLY" } });

    const activateResponse = await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: key.code, email: "reset-e2e@example.com", password: "supersecret123", hwid: "old-machine" },
    });
    expect(activateResponse.statusCode).toBe(201);

    const blockedResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "reset-e2e@example.com", password: "supersecret123", hwid: "new-machine" },
    });
    expect(blockedResponse.statusCode).toBe(403);

    const resetResponse = await app.inject({
      method: "POST",
      url: `/admin/keys/${key.id}/reset-device`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(resetResponse.statusCode).toBe(200);

    const unblockedResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "reset-e2e@example.com", password: "supersecret123", hwid: "new-machine" },
    });
    expect(unblockedResponse.statusCode).toBe(200);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -w @llz-clipper/api -- test/admin.keys.test.ts`
Expected: FAIL — `resetDeviceForKey is not a function` / 404s from the route not existing (Fastify returns 404 for an unregistered route).

- [ ] **Step 4: Add `resetDeviceForKey` to `adminKeyService.ts`**

Add this function right after the existing `revokeKey`:

```ts
export async function resetDeviceForKey(id: string) {
  return prisma.licenseKey.update({ where: { id }, data: { deviceId: null } });
}
```

- [ ] **Step 5: Add the route in `admin.routes.ts`**

Update the import line to include `resetDeviceForKey`:

```ts
import { createKey, createKeysBulk, listKeys, revokeKey, resetDeviceForKey } from "../services/adminKeyService";
```

Add the route right after the existing `POST /keys/:id/revoke` handler:

```ts
  app.post("/keys/:id/reset-device", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.licenseKey.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "key_not_found", message: "Key não encontrada" });
    const key = await resetDeviceForKey(id);
    return reply.code(200).send(key);
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w @llz-clipper/api -- test/admin.keys.test.ts`
Expected: PASS, all tests including the two pre-existing ones.

- [ ] **Step 7: Run the full API test suite**

Run: `npm test -w @llz-clipper/api`
Expected: PASS, every test file.

- [ ] **Step 8: Commit**

```bash
git add services/api/src/services/adminKeyService.ts services/api/src/routes/admin.routes.ts services/api/test/admin.keys.test.ts
git commit -m "feat(api): add POST /admin/keys/:id/reset-device"
```

---

### Task 3: `apps/desktop` — send `hwid` on login

**Files:**
- Modify: `apps/desktop/src/types.ts:27-30` (`LoginInput`)
- Modify: `apps/desktop/src/hooks/useAuth.ts:23-30` (`login`)
- Test: `apps/desktop/src/hooks/useAuth.test.ts`

**Interfaces:**
- Produces: `useAuth().login(email: string, password: string)` — same external signature as today (the hook still takes just email/password from the caller; it derives `hwid` internally, exactly like `activate()` already does). `LoginInput` (the type `authApi.login` accepts) gains a required `hwid: string` field.
- Consumes: `invoke<string>("get_hwid")` (same Tauri command `activate()` already calls).

- [ ] **Step 1: Read the current files first**

Read `apps/desktop/src/types.ts` (the `LoginInput` and `ActivateKeyInput` interfaces), `apps/desktop/src/hooks/useAuth.ts` in full, and `apps/desktop/src/hooks/useAuth.test.ts` in full — the second test (`"login() calls login, saves the session, and updates the store"`) needs updating.

- [ ] **Step 2: Update the failing test**

In `apps/desktop/src/hooks/useAuth.test.ts`, replace the `"login() calls login, saves the session, and updates the store"` test with:

```ts
  it("login() gets the hwid, calls login, saves the session, and updates the store", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_hwid") return Promise.resolve("hwid-456");
      return Promise.resolve(undefined);
    });
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: "at2",
      refreshToken: "rt2",
      user: { id: "1", email: "a@a.com", role: "USER" },
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login("a@a.com", "pw123456");
    });

    expect(authApi.login).toHaveBeenCalledWith({ email: "a@a.com", password: "pw123456", hwid: "hwid-456" });
    expect(invokeMock).toHaveBeenCalledWith("save_session", { refreshToken: "rt2" });
    expect(useAuthStore.getState().accessToken).toBe("at2");
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w @llz-clipper/desktop -- src/hooks/useAuth.test.ts`
Expected: FAIL — `authApi.login` was called with `{ email: "a@a.com", password: "pw123456" }`, missing `hwid`.

- [ ] **Step 4: Add `hwid` to `LoginInput`**

In `apps/desktop/src/types.ts`, change:

```ts
export interface LoginInput {
  email: string;
  password: string;
}
```

to:

```ts
export interface LoginInput {
  email: string;
  password: string;
  hwid: string;
}
```

- [ ] **Step 5: Update `useAuth.ts`'s `login`**

Change:

```ts
  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authApi.login({ email, password });
      await invoke("save_session", { refreshToken: result.refreshToken });
      setSession(result.accessToken, result.refreshToken, result.user);
    },
    [setSession]
  );
```

to:

```ts
  const login = useCallback(
    async (email: string, password: string) => {
      const hwid = await invoke<string>("get_hwid");
      const result = await authApi.login({ email, password, hwid });
      await invoke("save_session", { refreshToken: result.refreshToken });
      setSession(result.accessToken, result.refreshToken, result.user);
    },
    [setSession]
  );
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -w @llz-clipper/desktop -- src/hooks/useAuth.test.ts`
Expected: PASS, all 3 tests in the file.

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck -w @llz-clipper/desktop`
Expected: clean (confirms every other caller of `LoginInput`/`authApi.login` — there are none besides `useAuth.ts` — still compiles).

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/types.ts apps/desktop/src/hooks/useAuth.ts apps/desktop/src/hooks/useAuth.test.ts
git commit -m "feat(desktop): send hwid on login, matching activation"
```

---

### Task 4: `apps/desktop` — "Resetar dispositivo" button in the admin key table

**Files:**
- Modify: `apps/desktop/src/types.ts` (`LicenseKey`)
- Modify: `apps/desktop/src/services/adminApi.ts`
- Modify: `apps/desktop/src/components/KeyTable.tsx`
- Modify: `apps/desktop/src/pages/AdminPage.tsx`
- Test: `apps/desktop/src/pages/AdminPage.test.tsx`

**Interfaces:**
- Produces: `adminApi.resetDevice(id: string): Promise<LicenseKey>` — same shape as the existing `adminApi.revokeKey(id)` in the same file. `KeyTable`'s props gain `onResetDevice: (id: string) => void` and `resettingId?: string | null`, mirroring the existing `onRevoke`/`revokingId` props exactly.
- Consumes: `LicenseKey.deviceId: string | null` (new field, already present in every API response today as a raw Prisma scalar column — this task only adds it to the TypeScript type, no API change needed).

**Design note:** the button only shows when `key.status === "ACTIVE" && key.deviceId` — resetting a key with no device bound yet would be a no-op, so it's hidden rather than shown-but-pointless (spec says "visible when ACTIVE"; this narrows that to "ACTIVE and actually has something to reset," which is a strict improvement with no spec conflict).

- [ ] **Step 1: Read the current files first**

Read `apps/desktop/src/types.ts` (`LicenseKey`), `apps/desktop/src/services/adminApi.ts` in full, `apps/desktop/src/components/KeyTable.tsx` in full, `apps/desktop/src/pages/AdminPage.tsx` in full, and `apps/desktop/src/pages/AdminPage.test.tsx` in full — the existing `"revokes a key"` test (and the `sampleKey` fixture at the top of the file) are the direct templates.

- [ ] **Step 2: Write the failing test**

In `apps/desktop/src/pages/AdminPage.test.tsx`, add to the `beforeEach` block:

```ts
  vi.mocked(adminApi.resetDevice).mockReset().mockResolvedValue({ ...sampleKey, status: "ACTIVE", deviceId: null });
```

Add `deviceId: null` to the `sampleKey` fixture object (after `userId: null,`):

```ts
  deviceId: null,
```

Add this new test after the existing `"revokes a key"` test:

```ts
  it("resets a device on an active key with one bound", async () => {
    vi.mocked(adminApi.listKeys).mockResolvedValue({
      items: [{ ...sampleKey, status: "ACTIVE", deviceId: "d1" }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    const user = userEvent.setup();
    render(<AdminPage />);
    await screen.findByText("LLZ-AAAA-BBBB-CCCC");

    await user.click(screen.getByRole("button", { name: "Resetar dispositivo" }));

    await waitFor(() => {
      expect(adminApi.resetDevice).toHaveBeenCalledWith("k1");
    });
  });

  it("does not show Resetar dispositivo for a key with no device bound", async () => {
    render(<AdminPage />);
    await screen.findByText("LLZ-AAAA-BBBB-CCCC");
    expect(screen.queryByRole("button", { name: "Resetar dispositivo" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -w @llz-clipper/desktop -- src/pages/AdminPage.test.tsx`
Expected: FAIL — `adminApi.resetDevice` doesn't exist / `getByRole("button", { name: "Resetar dispositivo" })` finds nothing.

- [ ] **Step 4: Add `deviceId` to the `LicenseKey` type**

In `apps/desktop/src/types.ts`, add `deviceId: string | null;` to the `LicenseKey` interface, after `userId: string | null;`:

```ts
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
  deviceId: string | null;
  user?: { id: string; email: string } | null;
}
```

- [ ] **Step 5: Add `resetDevice` to `adminApi.ts`**

Add right after the existing `revokeKey`:

```ts
export function resetDevice(id: string): Promise<LicenseKey> {
  return authedRequest(`/admin/keys/${id}/reset-device`, { method: "POST" });
}
```

- [ ] **Step 6: Add the button to `KeyTable.tsx`**

Update the component's props and add the button, right after the existing "Revogar" button:

```tsx
interface KeyTableProps {
  keys: LicenseKey[];
  onRevoke: (id: string) => void;
  onResetDevice: (id: string) => void;
  revokingId?: string | null;
  resettingId?: string | null;
}

export function KeyTable({ keys, onRevoke, onResetDevice, revokingId = null, resettingId = null }: KeyTableProps) {
```

And in the row's action `<td>`, after the existing "Revogar" button block:

```tsx
                {key.status === "ACTIVE" && key.deviceId && (
                  <button disabled={resettingId === key.id} onClick={() => onResetDevice(key.id)}>
                    {resettingId === key.id ? "Resetando…" : "Resetar dispositivo"}
                  </button>
                )}
```

- [ ] **Step 7: Wire it up in `AdminPage.tsx`**

Add state and a handler, mirroring the existing `revokingId`/`handleRevoke`:

```tsx
  const [resettingId, setResettingId] = useState<string | null>(null);
```

```tsx
  async function handleResetDevice(id: string) {
    setResettingId(id);
    try {
      await adminApi.resetDevice(id);
      await load();
    } catch {
      // Same as above — fail silently here, OfflineBanner covers the network case.
    } finally {
      setResettingId(null);
    }
  }
```

And pass the new props to `<KeyTable>`:

```tsx
          <KeyTable
            keys={keys}
            onRevoke={handleRevoke}
            onResetDevice={handleResetDevice}
            revokingId={revokingId}
            resettingId={resettingId}
          />
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -w @llz-clipper/desktop -- src/pages/AdminPage.test.tsx`
Expected: PASS, every test in the file (including the pre-existing ones — `sampleKey` now has `deviceId: null`, so the button correctly stays hidden in all the other tests that don't override it).

- [ ] **Step 9: Run the full desktop test suite and typecheck**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS, every test file.
Run: `npm run typecheck -w @llz-clipper/desktop`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/src/types.ts apps/desktop/src/services/adminApi.ts apps/desktop/src/components/KeyTable.tsx apps/desktop/src/pages/AdminPage.tsx apps/desktop/src/pages/AdminPage.test.tsx
git commit -m "feat(desktop): add Resetar dispositivo button to the admin key table"
```

---

### Task 5: Final verification and README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current README**

Read `README.md` in full, focusing on the "O que NÃO está implementado nesta fase" section (around line 238-263) and the "Render de clipes (Fase 5B)" section (around line 211-223) to match its exact tone and structure.

- [ ] **Step 2: Update the README**

Remove this line from the "O que NÃO está implementado nesta fase" section (it's no longer true):

```
- Device-lock / limite de dispositivos por key, renovação de key — schema
  preparado, sem endpoint ainda
```

If that bullet list becomes empty after removing it, remove the "O que NÃO está implementado nesta fase" heading too (check the rest of the file first — read past line 264 to confirm whether there are other bullets under that heading before deciding).

Add a new section right after "Render de clipes (Fase 5B)" (same heading level, `##`):

```markdown
## Vínculo de dispositivo (HWID)

Cada key só pode estar ativa em um dispositivo por vez. Na ativação
(`Ativar licença`) e em todo login (`Já tenho conta`), o desktop envia o
HWID da máquina (`invoke("get_hwid")`, já usado desde a ativação). Se a
key ainda não tem dispositivo vinculado, o primeiro login vincula o HWID
automaticamente; se já tem, um login de um HWID diferente é recusado com
"Esta licença já está em uso em outro dispositivo." Um admin pode liberar
a key para um novo dispositivo pelo botão **Resetar dispositivo** na tela
Admin (ao lado de **Revogar**) — o próximo login de qualquer HWID vincula
de novo. O reset não derruba sessões já ativas, só afeta o próximo login.
```

- [ ] **Step 3: Run the entire test suite across every workspace**

Run: `npm test` (from the repo root)
Expected: PASS, every workspace.

- [ ] **Step 4: Run typecheck across every workspace that has it**

Run: `npm run typecheck --workspaces --if-present`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document HWID device-lock enforcement"
```
