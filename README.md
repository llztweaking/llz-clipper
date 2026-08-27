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
# edite .env com a DATABASE_URL, SHADOW_DATABASE_URL e um JWT_SECRET reais
```

Crie o banco e o usuário de aplicação (ajuste credenciais conforme seu ambiente):

```sql
CREATE DATABASE llz_clipper;
CREATE USER llz_app WITH PASSWORD 'sua-senha';
GRANT ALL PRIVILEGES ON DATABASE llz_clipper TO llz_app;
GRANT ALL ON SCHEMA public TO llz_app;
```

`SHADOW_DATABASE_URL` precisa de um usuário com permissão `CREATEDB` (ex: o
superusuário do Postgres) — é usado só por `prisma migrate dev` para
criar/descartar um banco temporário durante o desenvolvimento do schema.

Rode as migrations:

```bash
cd packages/database
npx dotenv -e ../../.env -- npx prisma migrate deploy
```

## Rodando a API

```bash
npm run dev -w @llz-clipper/api
```

A API sobe em `http://localhost:3000` (ou a porta definida em `PORT`).

## Testes

Os testes de integração rodam contra um banco de dados real
`llz_clipper_test` (não contra mocks). Crie-o da mesma forma que o banco de
desenvolvimento, aponte `DATABASE_URL` em `.env.test` para ele, aplique as
migrations com `prisma migrate deploy`, e rode:

```bash
npm test
```

Para checagem de tipos em todos os pacotes:

```bash
npm run typecheck
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
apps/desktop/        # Fase 2 — placeholder
services/api/         # API Fastify (auth, licenciamento, admin, streamers)
services/worker/       # Fase 3 — placeholder
packages/database/    # Schema Prisma, migrations, client compartilhado
packages/shared/      # Geração de key code, hashing de tokens
packages/types/       # DTOs compartilhados da API
docs/superpowers/      # Specs e planos de implementação
```

## Notas técnicas relevantes

- **Prisma está pinado em v6.19.3** (não a versão mais recente instalável).
  A v7/v8 do Prisma introduziu uma mudança grande de arquitetura
  (`prisma.config.ts` + driver adapters obrigatórios em vez de
  `datasource { url = env(...) }` no schema), ainda instável no momento
  deste desenvolvimento (v8 estava em release candidate). A v6 mantém a
  API clássica, documentada e estável, usada em todo este código.
- **Toolchain Rust do Tauri (Fase 2) usa GNU/MinGW**, não MSVC, para evitar
  a instalação pesada do Visual Studio Build Tools nesta máquina.
- A propriedade do Prisma Client para o model `VOD` é `prisma.vOD` (Prisma
  só faz lowercase da primeira letra do nome do model), não `prisma.vod`.

## O que NÃO está implementado nesta fase

- App desktop (Tauri) — Fase 2
- Upload de VOD, sistema de jobs, FFmpeg — Fase 3
- Transcrição, análise de áudio/vídeo, detecção de contexto, scoring — Fase 4
- Editor, preview, render, export — Fase 5
- Device-lock / limite de dispositivos por key, renovação de key — schema
  preparado, sem endpoint ainda
