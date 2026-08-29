# LLZ CLIPPER

Aplicativo Windows para transformar VODs de streamers em clips verticais
editados automaticamente. Este repositório contém a **Fase 1 (Fundação)**:
monorepo, banco de dados, autenticação, licenciamento por key e
administração; a **Fase 2 (Desktop Shell)**: o app Tauri + React com
login/ativação, sidebar, Streamers, Configurações e Admin; a **Fase 3
(Pipeline de VOD)**: seleção de VOD local, cópia para storage e extração
real de metadados/thumbnail via FFmpeg, através de um Job e worker reais;
e a **Fase 4 (Pipeline de IA)**: transcrição real via whisper.cpp, análise
heurística de áudio/vídeo, detecção de clipes candidatos e rascunho
automático de plano de edição, com tela de revisão para aprovar/rejeitar
cada clipe; e a **Fase 5A (Editor manual)**: ajuste de corte, legendas,
zoom, SFX, música e marca d'água por clipe aprovado, com prévia real
(vídeo + overlays CSS). Render de fato do vídeo final (Fase 5B) é a
próxima etapa — ver `docs/superpowers/specs/`.

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
apps/desktop/        # App Tauri + React (login, streamers, configurações, admin)
services/api/         # API Fastify (auth, licenciamento, admin, streamers)
services/worker/       # Worker real: copia VOD, extrai metadados via FFmpeg
packages/database/    # Schema Prisma, migrations, client compartilhado
packages/shared/      # Geração de key code, hashing de tokens
packages/types/       # DTOs compartilhados da API
docs/superpowers/      # Specs e planos de implementação
```

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

## Rodando o pipeline de VOD (Fase 3)

Com a API rodando, inicie também o worker (processo separado, responsável
por copiar o VOD para o storage local e extrair metadados via FFmpeg):

```bash
npm run dev -w @llz-clipper/worker
```

O worker faz polling na tabela `Job` a cada poucos segundos. Se ele for
reiniciado com um job "preso" no meio do processamento, esse job é marcado
como `FAILED` automaticamente — use o botão "Tentar novamente" na tela de
VOD para reprocessar.

Os arquivos ficam em `storage/vods/` (VODs copiados) e
`storage/thumbnails/` (thumbnails geradas), relativos ao diretório de onde
a API/worker são executados (configurável via a variável de ambiente
`STORAGE_ROOT`).

## Rodando a detecção de clipes por IA (Fase 4)

O worker (o mesmo processo da Fase 3) agora continua o processamento de
cada VOD além da cópia: transcreve o áudio com whisper.cpp, analisa
áudio/vídeo, detecta clipes candidatos por heurística, e gera um rascunho
de plano de edição por clipe — tudo local, sem serviços de IA em nuvem.

Duas variáveis de ambiente adicionais em `.env` (veja `.env.example`):

```bash
WHISPER_PATH="C:\caminho\para\whisper.cpp\build\bin\whisper-cli.exe"
WHISPER_MODEL_PATH="C:\caminho\para\whisper.cpp\models\ggml-base.bin"
```

Para compilar o `whisper.cpp` você mesmo:

```bash
git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j
bash models/download-ggml-model.sh base
```

`WHISPER_PATH` aponta para o `.exe` gerado em `build/bin/`; `WHISPER_MODEL_PATH`
para o `.bin` baixado em `models/`. Use o modelo multilíngue (`base`, sem
sufixo `.en`) — o produto é para streamers em português.

Depois que o worker processa um VOD, os clipes detectados aparecem na tela
**Clipes** do app (selecione o VOD na lista), onde dá para aprovar ou
rejeitar cada um. Edição de fato (zoom, SFX, música, ajuste de legendas) —
ver seção "Editor manual de clipes (Fase 5A)" abaixo — e render (Fase 5B)
completam o restante do fluxo.

## Editor manual de clipes (Fase 5A)

Clipes aprovados na tela **Clipes** ganham um botão **Editar**, que abre
uma tela de edição com prévia real (o vídeo de verdade, tocando o trecho
do corte, com legendas e marca d'água sobrepostas via CSS — o zoom é uma
aproximação visual, não idêntico ao render final).

Dá pra ajustar: início/fim do corte, texto e tempo de cada legenda, pontos
de zoom (tempo + nível), efeitos sonoros e música de fundo (arquivos
locais, escolhidos por um seletor nativo), e uma marca d'água (imagem
local + posição em um dos 4 cantos).

As alterações só são salvas ao clicar em **Salvar alterações** — nada é
persistido automaticamente. Render de fato do vídeo final (queima de
legenda, zoom, mixagem de áudio, watermark) é a Fase 5B, ainda não
implementada.

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

**Fase 2 (Desktop Shell)** está implementada: login/ativação, sidebar,
Streamers, Configurações (aba Conta) e Admin, todos funcionais contra a
API real. `/clips` e `/editor` agora são reais (ver Fases 4 e 5A abaixo).

**Fase 3 (Pipeline de VOD)** está implementada: seleção de VOD local,
cópia para storage, extração real de metadados e thumbnail via FFmpeg,
tudo através de um Job e worker reais.

**Fase 4 (Pipeline de IA)** está implementada: transcrição real via
whisper.cpp, análise heurística de áudio/vídeo (sem LLM), detecção de
clipes com pontuação e categoria, rascunho automático de EditPlan, e tela
de revisão (aprovar/rejeitar).

**Fase 5A (Editor manual)** está implementada: ajuste de corte, legendas,
zoom, SFX, música e marca d'água por clipe aprovado, com prévia real
(vídeo + overlays CSS). Render do vídeo final continua sendo Fase 5B.

- Render do vídeo final, export — Fase 5B
- Device-lock / limite de dispositivos por key, renovação de key — schema
  preparado, sem endpoint ainda
