# Fase 4 — Pipeline de IA (design)

Data: 2026-08-28
Status: aprovado pelo usuário, pronto para plano de implementação

## Contexto

Fases 1-3 do LLZ CLIPPER estão completas e mergeadas em `master`: fundação
(auth/licenciamento/admin), desktop shell (Tauri + React), e o pipeline de
VOD (seleção de arquivo local, cópia real, extração real de metadados via
FFmpeg, worker real com fila de `Job`). O schema Prisma já reserva os
valores de `JobStatus` para esta fase (`PROCESSING_AUDIO`, `TRANSCRIBING`,
`ANALYZING_VIDEO`, `ANALYZING_CONTEXT`, `DETECTING_CLIPS`,
`GENERATING_EDIT_PLANS`) e os modelos `Clip`/`EditPlan`, todos sem lógica
até agora.

Esta fase implementa a detecção automática de momentos/clipes a partir de
um VOD já ingerido: transcrição real, análise heurística de áudio/vídeo,
detecção de clipes candidatos com pontuação, e geração de um rascunho de
plano de edição por clipe — tudo 100% local (sem serviços de IA em nuvem),
sem processamento simulado.

Fases 5 (editor manual, preview, render, export) continua fora de escopo:
os `EditPlan`s gerados aqui são rascunhos; `zooms`/`sfx`/`music` ficam
vazios para o usuário preencher depois. `Render`/`RenderStatus` não são
tocados nesta fase.

## Decisões de arquitetura

- **100% local**: sem chamadas a APIs de IA na nuvem. Sem custo por VOD
  processado, funciona offline, mantém o áudio/vídeo do usuário na
  máquina dele.
- **Transcrição**: `whisper.cpp` como binário externo, no mesmo padrão já
  validado do `FFmpegProcessor` — `child_process.spawn`, resolvido via
  variável de ambiente (`WHISPER_PATH` para o binário, `WHISPER_MODEL_PATH`
  para o arquivo de modelo `.bin`). Forçamos idioma `pt` (produto para
  streamers brasileiros).
- **Detecção de momentos**: heurística determinística, sem LLM local. Usa
  palavras-chave configuráveis por categoria (`ClipCategory`) + picos de
  energia de áudio + proximidade de cortes de cena — não entende contexto
  semântico, só padrões, mas é rápido, sem dependência de modelo pesado
  adicional, e 100% testável de forma determinística.
- **`Job` estende a mesma cadeia da Fase 3**: o job de um VOD não termina
  mais em `COMPLETED` após a cópia+metadados — continua pelos estágios de
  IA até `COMPLETED` significar "processamento inicial completo, clipes
  prontos para revisão". Progresso (0-100%) recalibrado para cobrir o
  pipeline inteiro.
- **`EditPlan` é gerado automaticamente como rascunho** (não parado em
  apenas "clipe detectado") — bate com a presença de
  `GENERATING_EDIT_PLANS` no enum antes de `COMPLETED`.
- **Tela mínima de revisão no desktop** (`/clips`, hoje placeholder): lista
  de clipes com categoria/score/razão e aprovar/rejeitar. Sem player de
  vídeo, sem edição — isso é Fase 5.

## Modelo de dados

Uma alteração de schema: novo campo opcional em `VOD`.

```prisma
model VOD {
  // ...campos existentes...
  transcript Json? // array de { start, end, text } — transcript completo do VOD
}
```

Nenhuma outra mudança de schema é necessária — `Clip` e `EditPlan` já têm
todos os campos usados por esta fase.

## Pipeline (estágios do `Job`, em ordem)

Progresso recalibrado (a faixa de cópia da Fase 3 é comprimida para abrir
espaço para os novos estágios):

| Estágio | `currentStep` | Faixa de progresso |
|---|---|---|
| Cópia do arquivo (Fase 3, inalterado em lógica) | "Copiando arquivo" | 0-60% |
| Extração de metadados (Fase 3, inalterado em lógica) | "Extraindo metadados" | 60-65% |
| `PROCESSING_AUDIO` | "Processando áudio" | 65-75% |
| `TRANSCRIBING` | "Transcrevendo áudio" | 75-85% |
| `ANALYZING_VIDEO` | "Analisando vídeo" | 85-90% |
| `ANALYZING_CONTEXT` | "Analisando contexto" | 90-93% |
| `DETECTING_CLIPS` | "Detectando clipes" | 93-97% |
| `GENERATING_EDIT_PLANS` | "Gerando planos de edição" | 97-100% |
| `COMPLETED` | — | 100% |

Cada estágio, o que produz de verdade (nada simulado):

1. **`PROCESSING_AUDIO`** — extrai uma trilha de áudio mono 16kHz do vídeo
   copiado via FFmpeg (novo método `FFmpegProcessor.extractAudio`).
   Calcula um perfil de energia (RMS por janela de ~1s) lendo o WAV
   diretamente em Node — sinal real de picos de volume/empolgação.
2. **`TRANSCRIBING`** — roda `whisper.cpp` no áudio extraído via o novo
   `packages/transcription`. Produz segmentos reais com timestamps.
   Persistido em `VOD.transcript`.
3. **`ANALYZING_VIDEO`** — detecção real de cortes de cena via filtro
   `scene` do FFmpeg (novo método `FFmpegProcessor.detectSceneChanges`).
   Não persistido — sinal efêmero usado só nesta execução.
4. **`ANALYZING_CONTEXT`** — combina transcript + perfil de energia +
   cortes de cena numa linha do tempo pontuada: cada janela de tempo
   recebe uma pontuação de palavras-chave (por categoria, config
   hardcoded em `heuristicConfig.ts`) + bônus se há um pico de energia
   sobreposto + bônus se há um corte de cena próximo.
5. **`DETECTING_CLIPS`** — extrai os picos locais da linha do tempo
   pontuada, expande em janelas de 15-90s (respeitando limites,
   priorizando cortes próximos como fronteira), corta no máximo 10
   candidatos por VOD (os de maior pontuação). Cria `Clip` reais:
   `startTime`/`endTime`, `category` (da categoria de maior peso na
   janela, ou `SPOKEN_MOMENT`/`IMPORTANT_MOMENT` como fallback quando só
   energia/cena dispararam sem palavra-chave), `score` (0-100
   normalizado), `scoreReason` (string legível montada a partir de quais
   sinais dispararam), `status: DETECTED`.
6. **`GENERATING_EDIT_PLANS`** — para cada `Clip` novo, cria um
   `EditPlan`: `title` (das primeiras palavras do transcript do clipe),
   `segments` (um único segmento bruto `[{start, end}]` relativo ao VOD),
   `captions` (segmentos do transcript sobrepostos ao clipe, re-basados
   para tempo relativo ao clipe), `watermark`/`format`/`resolution`/`fps`
   herdados do `Preset`/`watermark` do streamer quando existirem (senão
   os defaults do próprio schema), `zooms`/`sfx`/`music`: `null`.

Qualquer exceção em qualquer estágio marca o `Job` inteiro `FAILED` com a
mensagem real do erro — mesmo padrão já usado na Fase 3, agora cobrindo o
pipeline inteiro, não só a cópia.

## `packages/transcription`

Mesma estrutura de `packages/ffmpeg`:

```ts
export interface TranscriptSegment {
  start: number; // segundos
  end: number;
  text: string;
}

export interface TranscriptionService {
  transcribe(wavPath: string, opts?: { language?: string }): Promise<TranscriptSegment[]>;
}

export class WhisperCppProcessor implements TranscriptionService { ... }
```

`WhisperCppProcessor` resolve o binário via `WHISPER_PATH` (env var ou
PATH, mesmo padrão de `FFMPEG_PATH`) e o modelo via `WHISPER_MODEL_PATH`
(obrigatório — sem modelo, `transcribe` rejeita com um erro claro). Chama
`whisper.cpp` com saída JSON (`--output-json`), parseia os segmentos.
Idioma fixado em `pt` por padrão, sobrescrevível via `opts.language`.

Modelo (`.bin`) não é distribuído com o instalador do app — documentado no
README como o próprio FFmpeg já é hoje (o usuário baixa uma vez e aponta o
caminho via variável de ambiente).

## Estágios do worker (`services/worker/src/stages/`)

Funções puras (sem I/O de banco), testáveis isoladamente com dados
sintéticos:

```
stages/
  processAudio.ts       (vodPath, ffmpeg) -> { wavPath, energyProfile }
  transcribe.ts          (wavPath, transcription) -> TranscriptSegment[]
  analyzeVideo.ts        (vodPath, ffmpeg) -> sceneChangeTimestamps: number[]
  analyzeContext.ts      (segments, energyProfile, sceneChanges) -> ScoredWindow[]
  detectClips.ts          (scoredWindows) -> ClipCandidate[]        (puro)
  generateEditPlanDraft.ts (clip, segments, streamer) -> EditPlanDraft  (puro)
```

`detectClips`/`generateEditPlanDraft` recebem dados e devolvem dados — a
escrita real no banco (`prisma.clip.create`, `prisma.editPlan.create`,
`prisma.vOD.update` para persistir `transcript`) acontece só em
`jobProcessor.ts`, que orquestra a sequência inteira e atualiza
`Job.status`/`currentStep`/`progress` entre estágios.

`services/worker/src/heuristicConfig.ts`: listas de palavras-chave por
`ClipCategory` em pt-BR, hardcoded nesta fase (configuração pelo usuário
fica fora de escopo — possível extensão futura via `Preset`).

## API

Novo arquivo `services/api/src/routes/clips.routes.ts`, mesma disciplina
de ownership das rotas de VOD/Job (`clip → vod → streamer → userId`):

- `GET /vods/:id/clips` — lista clipes de um VOD (id, category, score,
  scoreReason, startTime, endTime, status, título do EditPlan).
- `GET /clips/:id` — detalhe de um clipe, incluindo o `EditPlan` completo.
- `PATCH /clips/:id` — corpo `{ status: "APPROVED" | "REJECTED" }`, só
  aceita a partir de `status: DETECTED` atual.

## Desktop

- Novos tipos em `apps/desktop/src/types.ts`: `ClipCategory`,
  `ClipStatus`, `Clip`, `EditPlan` (formas serializadas equivalentes às da
  API).
- `apps/desktop/src/services/clipsApi.ts`: `listClips(vodId)`,
  `getClip(id)`, `updateClipStatus(id, status)`.
- `apps/desktop/src/hooks/useClips.ts`: dado um `vodId`, carrega e expõe
  os clipes, com `approve(id)`/`reject(id)`.
- `apps/desktop/src/components/ClipCard.tsx`: categoria, score, razão,
  duração, botões Aprovar/Rejeitar.
- `apps/desktop/src/pages/ClipsPage.tsx` substitui o `ComingSoonPage` em
  `/clips`: seletor de VOD (reaproveitando `useVods()`, filtrado a VODs
  com job `COMPLETED`) + grid de `ClipCard`s do VOD escolhido.

## Testes

- `packages/transcription`: contra o `whisper.cpp` real, com um fixture
  de áudio curto de fala real (poucos segundos) — decisão de como obter
  esse fixture fica para a implementação (TTS do SO ou um arquivo de voz
  livre de direitos incluído no repo).
- Estágios puros (`analyzeContext`, `detectClips`,
  `generateEditPlanDraft`): dados sintéticos determinísticos, sem
  FFmpeg/whisper reais rodando.
- `processAudio`/`analyzeVideo`: vídeo de teste real gerado via FFmpeg
  (mesmo padrão do `jobProcessor.test.ts` da Fase 3) — como o vídeo
  sintético não tem fala/cenas reais, o teste verifica estrutura de dados
  válida (perfil de energia não vazio, array de cortes bem formado), não
  o conteúdo semântico.
- `jobProcessor.ts`: teste de integração ponta a ponta estendido, banco
  real, cobrindo até `GENERATING_EDIT_PLANS`/`COMPLETED`.
- API/desktop: mesmo padrão das fases anteriores (rotas com Postgres real
  + ownership; hooks/páginas com API mockada).

## Fora de escopo (Fase 5)

- Editor manual (zoom, SFX, música, ajuste de legendas/segmentos).
- Preview e render de clipes (`Render`/`RenderStatus`).
- Configuração de palavras-chave pelo usuário.
- Qualquer processamento de IA em nuvem.
- Retomada/paralelização do pipeline (mesma limitação de "um job por vez"
  já aceita na Fase 3).
