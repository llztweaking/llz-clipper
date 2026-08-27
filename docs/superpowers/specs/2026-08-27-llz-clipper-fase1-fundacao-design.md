# LLZ CLIPPER — Fase 1: Fundação (design)

## Contexto

LLZ CLIPPER é um aplicativo desktop Windows que transforma VODs de streamers em
clips verticais editados automaticamente (transcrição, análise de áudio/vídeo,
detecção de momentos, edit plan, render via FFmpeg). O projeto completo é grande
demais para uma única spec, então foi decomposto em fases independentes:

1. **Fundação** (esta spec) — monorepo, banco, autenticação, licenciamento, admin, streamers (CRUD)
2. Desktop shell — app Tauri funcional consumindo a API da Fase 1 (login, sidebar, telas)
3. Pipeline de VOD — upload, sistema de jobs, FFmpeg real, storage local
4. Pipeline de IA — transcrição, análise de áudio/vídeo, detecção de contexto, scoring, dedup, título (com mocks trocáveis)
5. Editor/Render — Edit Plan, editor, preview, render final, export

Esta spec cobre **apenas a Fase 1**: tudo que não depende de processamento de
vídeo/IA — a base de contas, licenciamento e administração que o resto do
produto vai consumir.

## Ambiente de desenvolvimento (já preparado nesta máquina)

- Node.js v22 + npm (já presente)
- Rust — toolchain **GNU** (`stable-x86_64-pc-windows-gnu`), via rustup, com GCC/MinGW-w64 (WinLibs UCRT) como linker. Optou-se pelo GNU em vez do MSVC para evitar a instalação pesada do Visual Studio Build Tools (vários GB); Tauri suporta oficialmente ambos os toolchains no Windows.
- FFmpeg 9.0.1 (Gyan.FFmpeg, full build) — instalado via winget, no PATH.
- PostgreSQL 16 — instalado via winget, rodando como serviço Windows (`postgresql-x64-16`). Banco dedicado `llz_clipper` e usuário de aplicação `llz_app` (sem privilégios de superusuário) já criados.

## Estrutura do monorepo

```
LLZ-CLIPPER/
  apps/
    desktop/                 # Tauri + React + TS (Fase 2)
  services/
    api/                     # Fastify + TS — REST API
      src/
        routes/
        controllers/
        middleware/
        services/
        repositories/
        auth/
      prisma/ -> (via packages/database)
    worker/                  # processamento em background (Fase 3+)
      src/
        jobs/
        processors/
        services/
  packages/
    database/                # schema Prisma + client compartilhado + migrations
    shared/                  # tipos e utilitários compartilhados entre api/worker/desktop
    types/                   # contratos de API (DTOs) compartilhados
  docs/
    superpowers/specs/
  .env.example
  package.json               # npm workspaces raiz
```

Gerenciador de pacotes: **npm workspaces** (evita introduzir pnpm/yarn sem necessidade).

## Stack do backend

| Camada | Escolha | Justificativa |
|---|---|---|
| Framework HTTP | Fastify + TypeScript | Leve, schema-validation nativo, menos "mágica" que NestJS |
| ORM/Migrations | Prisma | Migrations versionadas reais, types gerados do schema |
| Autenticação | JWT access token (15 min) + refresh token opaco (hash no banco, 30 dias) | Nunca confia no frontend; permite revogação granular |
| Rate limiting | `@fastify/rate-limit` em memória | Sem dependência de Redis nesta fase; trocável depois |
| Fila de jobs (schema apenas nesta fase) | Tabela `Job` no Postgres | Real, sem infra extra; Fase 3 implementa o worker que consome |

## Schema do banco (Prisma)

```prisma
enum Role { USER ADMIN }
enum PlanType { MONTHLY QUARTERLY }
enum KeyStatus { UNUSED ACTIVE EXPIRED REVOKED }
enum ClipCategory { PLAY FUNNY REACTION FAIL CLUTCH SPOKEN_MOMENT IMPORTANT_MOMENT }
enum ClipStatus { DETECTED READY APPROVED REJECTED RENDERING COMPLETED FAILED }
enum JobStatus {
  QUEUED UPLOADING PROCESSING_AUDIO TRANSCRIBING ANALYZING_VIDEO
  ANALYZING_CONTEXT DETECTING_CLIPS GENERATING_EDIT_PLANS RENDERING
  COMPLETED FAILED
}
enum RenderStatus { QUEUED RENDERING COMPLETED FAILED }

model User {
  id            String        @id @default(uuid())
  email         String        @unique
  passwordHash  String?
  role          Role          @default(USER)
  createdAt     DateTime      @default(now())
  licenseKeys   LicenseKey[]
  devices       Device[]
  streamers     Streamer[]
  refreshTokens RefreshToken[]
  usageLogs     UsageLog[]
}

model LicenseKey {
  id           String     @id @default(uuid())
  code         String     @unique
  plan         PlanType
  status       KeyStatus  @default(UNUSED)
  usageLimit   Int?
  createdAt    DateTime   @default(now())
  activatedAt  DateTime?
  expiresAt    DateTime?
  revokedAt    DateTime?
  userId       String?
  user         User?      @relation(fields: [userId], references: [id])
  deviceId     String?
  device       Device?    @relation(fields: [deviceId], references: [id])
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
  id         String   @id @default(uuid())
  name       String
  username   String
  logoUrl    String?
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  presetId   String?
  preset     Preset?  @relation(fields: [presetId], references: [id])
  watermark  Json?
  createdAt  DateTime @default(now())
  vods       VOD[]
}

model VOD {
  id           String    @id @default(uuid())
  filename     String
  storagePath  String
  durationSec  Int?
  width        Int?
  height       Int?
  fps          Float?
  sizeBytes    BigInt?
  codec        String?
  streamerId   String
  streamer     Streamer  @relation(fields: [streamerId], references: [id])
  presetId     String?
  preset       Preset?   @relation(fields: [presetId], references: [id])
  createdAt    DateTime  @default(now())
  jobs         Job[]
  clips        Clip[]
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
  id          String   @id @default(uuid())
  clipId      String   @unique
  clip        Clip     @relation(fields: [clipId], references: [id])
  title       String
  segments    Json
  captions    Json?
  watermark   Json?
  zooms       Json?
  sfx         Json?
  music       Json?
  format      String   @default("9:16")
  resolution  String   @default("1080x1920")
  fps         Int      @default(60)
  updatedAt   DateTime @updatedAt
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
  id           String    @id @default(uuid())
  vodId        String
  vod          VOD       @relation(fields: [vodId], references: [id])
  status       JobStatus @default(QUEUED)
  progress     Int       @default(0)
  currentStep  String?
  error        String?
  createdAt    DateTime  @default(now())
  startedAt    DateTime?
  finishedAt   DateTime?
}

model Render {
  id          String       @id @default(uuid())
  clipId      String
  clip        Clip         @relation(fields: [clipId], references: [id])
  status      RenderStatus @default(QUEUED)
  progress    Int          @default(0)
  outputPath  String?
  error       String?
  createdAt   DateTime     @default(now())
  finishedAt  DateTime?
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

Nota: `VOD`, `Clip`, `EditPlan`, `Job`, `Render`, `Preset` fazem parte do schema
completo desde já (para não exigir migration destrutiva depois), mas nenhuma
rota ou lógica de negócio para eles é implementada nesta fase — isso é
explicitamente escopo das Fases 3–5.

## Autenticação e licenciamento

### Ativação de key

```
POST /auth/activate-key
body: { code, email, password, hwid }

1. Busca LicenseKey pelo code
   - não existe            → 404 "Key inválida"
   - status = REVOKED      → 403 "Key revogada"
   - status = EXPIRED      → 403 "Key expirada"
   - status = ACTIVE e userId != null e diferente do solicitante → 409 "Key já vinculada"
   - status = UNUSED:
       - cria/associa User (email + bcrypt hash da senha)
       - cria/associa Device (hash do hwid)
       - marca key: status=ACTIVE, activatedAt=now,
         expiresAt = now + 30 dias (MONTHLY) ou 90 dias (QUARTERLY)
2. Gera accessToken (JWT, 15 min) + refreshToken (opaco, hash salvo em RefreshToken, 30 dias)
3. Registra UsageLog "key_activated"
4. Retorna { accessToken, refreshToken, user }
```

### Login / refresh / logout

```
POST /auth/login    { email, password }
  → valida senha, valida key vinculada ainda ACTIVE e não expirada
  → key expirada nesse meio tempo → 403 "Licença expirada" (e atualiza status para EXPIRED)
  → gera novo par de tokens

POST /auth/refresh  { refreshToken }
  → valida hash no banco, não revogado, não expirado → emite novo accessToken

POST /auth/logout   { refreshToken }
  → marca RefreshToken.revokedAt = now

GET  /auth/me
  → retorna usuário autenticado + status da key
```

### Middleware de proteção

- Toda rota exceto `/auth/*` exige `Authorization: Bearer <accessToken>`.
- O middleware verifica assinatura/expiração do JWT **e** recarrega a key
  vinculada a cada request, checando `status = ACTIVE` e `expiresAt > now`.
  Uma key revogada/expirada derruba a sessão imediatamente, não só no próximo
  login.
- Rotas `/admin/*` exigem adicionalmente `role = ADMIN`.
- Expiração é avaliada sob demanda (lazy): sempre que uma key é lida e
  `expiresAt < now` com `status = ACTIVE`, o sistema atualiza para `EXPIRED`
  na hora — sem necessidade de um scheduler/cron rodando em background.

## Admin

```
POST /admin/keys          { plan }                     → cria 1 LicenseKey (UNUSED)
POST /admin/keys/bulk     { plan, count }               → cria N keys, retorna lista
GET  /admin/keys          ?search=&status=&plan=&page=  → lista paginada (join com User)
POST /admin/keys/:id/revoke                             → status=REVOKED
GET  /admin/logs          ?userId=&action=&page=        → UsageLog paginado
```

- Geração de código: `LLZ-XXXX-XXXX-XXXX`, via `crypto.randomBytes`, alfabeto
  sem caracteres ambíguos (sem `0/O`, `1/I`), checagem de unicidade com retry.
- Primeiro admin: script `npm run seed:admin -- --email=... --password=...`
  em `services/api` (cria ou promove usuário para `role=ADMIN`). Documentado
  no README.

## Streamers (CRUD)

```
GET    /streamers
POST   /streamers      { name, username, logoUrl?, watermark?, presetId? }
GET    /streamers/:id
PUT    /streamers/:id
DELETE /streamers/:id
```

Sem VOD/clip nesta fase. Dono do streamer é sempre o `user` autenticado da
requisição — não existe streamer compartilhado entre contas.

## Segurança

- Nenhum secret (JWT secret, credenciais de banco) no código-fonte — tudo via
  `.env`, nunca commitado (`.env.example` documenta as chaves necessárias).
- Senhas com bcrypt; refresh tokens armazenados como hash (nunca em texto puro).
- Usuário comum recebe `403` em qualquer rota `/admin/*`.
- Validação de licença sempre no backend — o desktop (Fase 2) nunca decide
  sozinho se o acesso está liberado.

## Testes (escopo desta fase)

- Validação de key: válida, inválida, expirada, revogada, já vinculada
- Expiração automática (lazy) ao ler uma key vencida
- Autorização de admin (bloqueio de rota `/admin/*` para `role=USER`)
- Geração de código de key (formato, unicidade)
- CRUD de streamers (isolamento por usuário — um usuário não vê streamer de outro)

## Fora de escopo (fases futuras)

- Qualquer endpoint de VOD, Job, Clip, EditPlan, Render (Fases 3–5)
- App desktop (Fase 2)
- Device-lock / limite de dispositivos por key (schema já preparado, lógica não)
- Renovação de key, troca de dispositivo (preparado no schema, sem endpoint ainda)
