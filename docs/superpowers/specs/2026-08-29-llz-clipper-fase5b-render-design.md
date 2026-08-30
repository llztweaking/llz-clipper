# Fase 5B — Render final de clipes (design)

Data: 2026-08-29
Status: aprovado pelo usuário, pronto para plano de implementação

## Contexto

Fase 5A (editor manual) está completa e mergeada em `master`: um clipe
`APPROVED` tem um `EditPlan` editável (corte único, legendas, pontos de
zoom, efeitos sonoros, música de fundo, marca d'água), com uma prévia
real via `<video>` + overlays CSS — mas **sem gerar vídeo final**.

Esta spec cobre a **Fase 5B — render**: pegar o `EditPlan` de um clipe e
efetivamente produzir um arquivo de vídeo vertical (9:16) real, via
FFmpeg, aplicando tudo que o editor deixou configurado. Existe desde
fases anteriores um model `Render` no schema (`clipId`, `status`,
`progress`, `outputPath`, `error`, `createdAt`, `finishedAt`) e um enum
`RenderStatus` (QUEUED/RENDERING/COMPLETED/FAILED) — nenhum dos dois tem
uso real ainda. `ClipStatus` também já tem `RENDERING`/`COMPLETED`/`FAILED`
pré-provisionados, além dos já usados `DETECTED`/`APPROVED`/`REJECTED`.

## Decisões de arquitetura

- **Um processo `ffmpeg` por render, um único grafo de filtros**: em vez
  de múltiplas passagens com arquivos intermediários, `renderClip` monta
  um `-filter_complex` que faz tudo numa só invocação — corte, zoom,
  legendas, marca d'água e mixagem de áudio. Mais simples de raciocinar
  do que dividir em passes, e evita o problema mais frágil do FFmpeg
  (dimensões de `crop` variando quadro a quadro dentro de um só filtro)
  ao tratar cada trecho de zoom como um sub-clipe de escala constante que
  depois é concatenado.
- **Zoom é corte instantâneo, não transição suave**: cada ponto de zoom
  define um novo nível constante até o próximo ponto — sem interpolação
  quadro a quadro. Bate exatamente com o que a prévia da Fase 5A já
  mostra (`transform: scale()` sem transição), e simplifica o grafo de
  filtros (cada sub-trecho tem `crop`+`scale` com valores fixos, sem
  expressões dependentes de `t`). Segue a mesma regra de
  `getZoomScale` (`apps/desktop/src/utils/clipPreview.ts`, Fase 5A) já
  usada na prévia: escala `1.0` (sem zoom) antes do primeiro ponto, e o
  nível do último ponto se mantém constante depois dele até o fim do
  clipe.
- **Legendas com estilo fixo**: mesmo visual da prévia (fundo escuro
  semi-transparente, texto branco, centralizado embaixo), via `drawtext`
  com `enable='between(t,start,end)'` por legenda. Sem campos novos de
  estilo no `EditPlan`, sem UI de customização.
- **Áudio mixado sem "ducking"**: o áudio original do trecho, cada cue de
  SFX (atrasado até seu timestamp via `adelay`) e a música de fundo (com
  o volume configurado) são combinados com `amix`. A música repete em
  loop (`aloop`) se for mais curta que o clipe, e é cortada se for mais
  longa — sempre preenche a duração inteira do clipe. Não há redução
  automática do volume da música durante a fala.
- **Campos ausentes no `EditPlan` não geram filtro nenhum**: um clipe sem
  legendas/zoom/sfx/música/marca d'água renderiza como um trim+crop 9:16
  simples com o áudio original — os ramos do grafo de filtros
  correspondentes simplesmente não entram na montagem do comando.
- **Segundo loop de polling no mesmo processo worker**: `services/worker`
  ganha `processNextRender()` (mesma forma de `processNextJob()`) rodando
  em paralelo ao loop de `Job` já existente — não é um processo novo.
  Como cada chamada ao ffmpeg é um processo filho assíncrono, não há
  problema real em uma ingestão de VOD e uma renderização acontecerem
  "ao mesmo tempo" no mesmo worker.
- **Re-render sempre permitido**: o histórico de tentativas já é suportado
  pelo schema (`Clip.renders: Render[]`) — cada clique em "Renderizar"
  cria uma nova linha `Render`, e a tela sempre reflete a mais recente
  (`orderBy: createdAt desc, take: 1`, mesmo padrão que `jobs` já usa em
  `VOD`). Editar o `EditPlan` de um clipe `COMPLETED` volta o status para
  `APPROVED` (o arquivo já renderizado fica desatualizado em relação ao
  plano); tanto editar quanto renderizar de novo funcionam a partir de
  `APPROVED` ou `COMPLETED`.
- **Sem rota nova de streaming de vídeo**: `Render.outputPath` é exposto
  como caminho local cru na resposta da API (mesmo padrão que
  `VOD.storagePath`/`sourcePath` já usam) e o desktop abre/revela o
  arquivo diretamente via `@tauri-apps/plugin-opener` (já é dependência
  do projeto) — sem precisar servir o arquivo pela API.
- **Falha de render não trava o clipe**: ao falhar (incluindo recuperação
  de renders presos ao reiniciar o worker, espelhando `recoverStuckJobs`),
  `Clip.status` volta para `APPROVED` — diferente do `Job`/VOD, que fica
  `FAILED` permanentemente até um retry explícito.

## Modelo de dados

Nenhuma migration é necessária. O model `Render` e o enum `RenderStatus`
já existem desde fases anteriores com exatamente os campos precisos:
`id`, `clipId`, `status`, `progress`, `outputPath`, `error`, `createdAt`,
`finishedAt`. Esta fase é a primeira a de fato popular e ler esses campos.

`ClipStatus` passa a usar de verdade os valores `RENDERING`/`COMPLETED`
(já existentes no enum, nunca setados por código até agora). Transições:

```
APPROVED ──(POST /clips/:id/render)──> RENDERING
COMPLETED ──(POST /clips/:id/render)──> RENDERING   (re-render)
RENDERING ──(render termina com sucesso)──> COMPLETED
RENDERING ──(render falha, ou recuperado como preso)──> APPROVED
COMPLETED ──(PATCH /clips/:id/edit-plan com sucesso)──> APPROVED
```

`DETECTED`/`REJECTED` continuam fora do alcance de `render`/`edit-plan`
(ambas as rotas seguem exigindo `APPROVED` ou `COMPLETED`).

## API (`services/api`)

- **`POST /clips/:id/render`** — enfileira uma renderização. Ownership
  igual às rotas de clip já existentes (404 se o clipe não pertence ao
  usuário autenticado). 400 `invalid_status` se `clip.status` não for
  `APPROVED` nem `COMPLETED`. Cria uma linha `Render` (`status: QUEUED`),
  muda `Clip.status` para `RENDERING`, responde `201 { renderId }`.
- **`GET /clips/:id`** e **`GET /vods/:vodId/clips`** passam a incluir
  `renders: { orderBy: { createdAt: "desc" }, take: 1 }` na consulta
  Prisma e expor isso como `latestRender` na resposta serializada.
- **`PATCH /clips/:id/edit-plan`** (já existe, Fase 5A) — o guard de
  status passa a aceitar `APPROVED` **ou** `COMPLETED` (hoje só aceita
  `APPROVED`). Ao salvar com sucesso enquanto o status era `COMPLETED`,
  a mesma transação que atualiza o `EditPlan` também volta
  `Clip.status` para `APPROVED`.

## `packages/ffmpeg`

Novo método na interface `VideoProcessor`/implementação `FFmpegProcessor`:

```ts
interface RenderInput {
  sourcePath: string;                 // VOD.storagePath
  outputPath: string;
  segment: { start: number; end: number };   // relativo ao VOD
  resolution: string;                 // ex. "1080x1920", de EditPlan
  fps: number;                        // de EditPlan
  captions: EditPlanCaption[] | null; // relativo ao clipe
  zooms: ZoomPoint[] | null;          // relativo ao clipe
  sfx: SfxCue[] | null;               // relativo ao clipe
  music: MusicTrack | null;
  watermark: Watermark | null;
}

renderClip(input: RenderInput, onProgress?: (percent: number) => void): Promise<void>
```

Monta um único comando `ffmpeg` (ver "Decisões de arquitetura" acima para
a estrutura do grafo de filtros) e o executa via `child_process.spawn`,
seguindo o mesmo padrão de `runCommand` já usado pelos outros métodos de
`FFmpegProcessor`. Progresso: `-progress pipe:1` emite linhas
`out_time=...` que, comparadas contra `segment.end - segment.start`
(duração final conhecida de antemão), dão o `%` — mesmo padrão de
throttle (só atualiza quando o valor reportado muda) já usado em
`copyIntoStorage`.

## `services/worker`

- **`renderProcessor.ts`** (novo) — `processNextRender()`, mesma forma de
  `processNextJob()`: busca o `Render` mais antigo com `status: QUEUED`,
  carrega o `Clip`+`EditPlan`+`VOD` relacionados, chama `renderClip`
  atualizando `progress` durante a execução, e ao final grava
  `outputPath`+`status: COMPLETED` (sucesso) ou `error`+`status: FAILED`
  mais `Clip.status: APPROVED` (falha).
- **`index.ts`** — ganha um segundo loop de polling (mesmo intervalo de
  3s do loop de `Job`) chamando `processNextRender()`, rodando em
  paralelo ao loop existente.
- **`recovery.ts`** — ganha o equivalente de `recoverStuckJobs` para
  `Render` (qualquer um fora de QUEUED/COMPLETED/FAILED ao iniciar o
  worker vira `FAILED`, com o `Clip` correspondente voltando a
  `APPROVED`).
- **Saída física do arquivo**: `packages/storage`'s `LocalStorageService`
  ganha um diretório `renders/` e um `getRenderPath(clipId, renderId)`,
  mesma forma de `getThumbnailPath`.

## Desktop (`apps/desktop`)

- **`EditorPage.tsx`**: botão "Renderizar", visível quando `clip.status`
  é `APPROVED` ou `COMPLETED`. Ao clicar, `POST /clips/:id/render` e
  passa a buscar `GET /clips/:id` a cada 2s enquanto `latestRender.status`
  for `QUEUED`/`RENDERING` (mesmo padrão condicional de polling que
  `useVods.ts` já usa para `Job`), mostrando uma barra de progresso.
  `COMPLETED` mostra "Renderização concluída" + botão "Abrir arquivo"
  (`revealItemInDir`/`openPath` de `@tauri-apps/plugin-opener` sobre
  `latestRender.outputPath`). `FAILED` mostra o erro e permite tentar de
  novo. Os campos de edição ficam desabilitados durante `RENDERING`.
- **`ClipsPage.tsx`/`ClipCard.tsx`**: o card do clipe reflete o mesmo
  status/progresso de render (visualmente equivalente ao que `VodCard.tsx`
  já mostra pro `Job` de ingestão), com o mesmo botão "Abrir arquivo"
  quando pronto, e a lista entra em polling automático enquanto algum
  clipe estiver `RENDERING`.

## Testes

- **`packages/ffmpeg`**: `renderClip` testado com ffmpeg real (`lavfi`
  como fonte sintética, mesmo padrão de `FFmpegProcessor.test.ts` — sem
  mocks), cobrindo: trim simples sem edição nenhuma, com legendas, com
  pontos de zoom, com SFX/música, com marca d'água. Asserções estruturais
  via `probe()` do próprio output (duração, resolução, fps corretos) e
  existência/tamanho do arquivo — não verificação pixel a pixel.
- **`services/worker`**: `renderProcessor.test.ts` segue o padrão de
  `jobProcessor.test.ts` (Postgres real de teste, sem mock do banco).
- **`services/api`**: novos testes de `POST /clips/:id/render` e da
  extensão de `PATCH /clips/:id/edit-plan` seguem o padrão de
  `editPlans.test.ts`/`vods.test.ts` (Postgres real, casos de
  ownership/guard de status).

## Fora de escopo nesta fase

- Transição suave de zoom (só corte instantâneo).
- Estilo de legenda configurável (fonte/cor/tamanho).
- "Ducking" de áudio (redução automática da música durante a fala).
- Cancelar um render em andamento.
- Renderizar vários clipes de uma vez (em lote).
- Escolher resolução/fps manualmente por render (sempre usa o que já
  está gravado no `EditPlan`, herdado do streamer/preset desde a Fase 4).
- Migrar `ClipStatus`/fluxo de aprovação em si — só passa a usar valores
  do enum que já existiam, sem mudar o que veio antes desta fase.
