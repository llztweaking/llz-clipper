# Fase 5A — Editor manual de clipes (design)

Data: 2026-08-29
Status: aprovado pelo usuário, pronto para plano de implementação

## Contexto

Fases 1-4 do LLZ CLIPPER estão completas e mergeadas em `master`: fundação,
desktop shell, pipeline de VOD (Fase 3), e pipeline de IA (Fase 4) —
transcrição real via whisper.cpp, detecção heurística de clipes, e um
`EditPlan` rascunho gerado automaticamente por clipe aprovado (título,
`segments` com um único corte, `captions` recortadas do transcript,
`watermark`/`format`/`resolution`/`fps` herdados do streamer/preset).
`zooms`/`sfx`/`music` ficam `null` desde a Fase 4 — sem lógica ainda.

A Fase 5 completa (editor + render real) foi dividida em duas: esta spec
cobre só a **Fase 5A — editor manual**, uma tela onde o usuário ajusta o
rascunho do `EditPlan` de um clipe já `APPROVED` (aparar o corte, editar
legendas, adicionar pontos de zoom, efeitos sonoros, música de fundo, e
marca d'água), com uma prévia visual real (vídeo real + sobreposições
CSS), mas **sem gerar o vídeo final ainda** — isso é a Fase 5B, uma spec
separada, despachada depois desta.

## Decisões de arquitetura

- **Sem render nesta fase**: o editor só lê/escreve o `EditPlan` no banco.
  A prévia usa o `<video>` real do VOD + overlays CSS — dá feedback visual
  real sem precisar do FFmpeg aqui. O zoom na prévia é uma aproximação
  (`transform: scale()`), não idêntico ao render final.
- **Corte único, sem multi-segmento**: `EditPlan.segments` continua um
  array de um item (`[{start, end}]`, relativo ao VOD). O editor só ajusta
  esses dois valores (aparar início/fim) — combinar cortes não-contínuos
  do VOD num clipe só fica fora de escopo.
- **SFX/música**: arquivos locais escolhidos via seletor nativo (mesmo
  padrão já usado pra selecionar VOD na Fase 3) — sem biblioteca
  embutida, sem catálogo.
- **Marca d'água é um arquivo local, não `Streamer.logoUrl`**: esse campo
  existe no schema desde a Fase 1 mas nunca ganhou um campo no formulário
  de Streamers, e a API o valida como URL remota (`z.string().url()`) —
  usá-lo puxaria uma dependência de rede pro render da Fase 5B, contra o
  padrão "tudo local" seguido até aqui. Em vez disso, a marca d'água vira
  um arquivo de imagem local escolhido no próprio editor. `Streamer.logoUrl`
  continua órfão, sem uso — fora de escopo consertar isso agora.
- **Edição só em clipes `APPROVED`**: o `PATCH` do `EditPlan` recusa
  clipes `DETECTED`/`REJECTED`.
- **Salvamento explícito**: um botão "Salvar alterações" manda o
  `EditPlan` inteiro de uma vez — não salva a cada edição.

## Modelo de dados

Nenhuma mudança de schema — `EditPlan.zooms`/`sfx`/`music`/`watermark`
já são `Json?`. Esta fase só define (e documenta) a forma que cada um
passa a ter, validada na API, não imposta pelo Postgres:

```ts
export interface ZoomPoint {
  time: number;   // segundos, relativo ao início do clipe (0 = início do corte)
  scale: number;  // 1.0 = sem zoom
}

export interface SfxCue {
  time: number;      // segundos, relativo ao clipe
  filePath: string;  // caminho local (.mp3/.wav)
}

export interface MusicTrack {
  filePath: string; // caminho local (.mp3/.wav)
  volume: number;   // 0-1
}

export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface Watermark {
  filePath: string; // caminho local de imagem (.png/.jpg)
  position: WatermarkPosition;
}
```

`EditPlan.segments`/`captions` mantêm exatamente a forma já usada desde a
Fase 4 (`{start, end}[]` relativo ao VOD; `{start, end, text}[]` relativo
ao clipe).

## Navegação

- `apps/desktop/src/pages/ClipsPage.tsx` (Fase 4) ganha um botão
  **"Editar"** nos clipes com `status === "APPROVED"` (ao lado da mensagem
  "Aprovado" já existente).
- Nova rota `/editor/:clipId` substitui o placeholder `ComingSoonPage`
  atualmente em `/editor` — precisa de um parâmetro de rota (`HashRouter`
  já suporta `useParams`).
- `EditorPage` carrega o clipe via `GET /clips/:id` (já existe da Fase 4,
  já retorna `editPlan` completo) e mantém um estado de rascunho editável
  em memória, persistido só no clique de Salvar.

## Componentes do editor

Todos em `apps/desktop/src/components/editor/`, orquestrados por
`EditorPage.tsx`:

- **`VideoPreview`**: `<video>` real tocando o VOD (via seu `storagePath`,
  servido por um novo endpoint autenticado — ver seção API), restrito ao
  intervalo do corte atual (`segments[0].start`–`end`), com loop dentro
  desse trecho. Overlays CSS: legenda ativa no instante atual (calculada
  por uma função pura `getActiveCaption(captions, clipRelativeTime)`),
  marca d'água posicionada por `watermark.position`, e uma escala
  aproximada de zoom (`getZoomScale(zooms, clipRelativeTime)` — interpola
  linearmente entre o ponto anterior e o próximo, mantém o nível do
  último ponto após o fim da lista).
- **`TrimControls`**: dois campos numéricos (início/fim do corte, tempo
  absoluto do VOD), validados contra `[0, VOD.durationSec]` e
  `start < end`.
- **`CaptionEditor`**: lista de legendas (texto + início/fim relativos ao
  clipe) — adicionar, remover, editar cada campo.
- **`ZoomEditor`**: lista de pontos de zoom (tempo + nível) — adicionar,
  remover, editar.
- **`SfxEditor`**: lista de efeitos sonoros (tempo + arquivo) — adicionar
  via seletor nativo (`@tauri-apps/plugin-dialog`, filtro `.mp3`/`.wav`),
  remover.
- **`MusicPicker`**: um arquivo (seletor nativo, mesmo filtro) + campo de
  volume (0-1).
- **`WatermarkPicker`**: liga/desliga + seletor de arquivo (filtro
  `.png`/`.jpg`) + posição (4 cantos).

## API

### Servir o vídeo do VOD para a prévia

O `VideoPreview` precisa carregar o arquivo real do VOD (`storagePath`) —
como a API já serve a thumbnail via `GET /vods/:id/thumbnail` (Fase 3),
esta fase adiciona `GET /vods/:id/video` no mesmo padrão (ownership
checado, streaming via `createReadStream`, `Content-Type: video/mp4`).
Igual à thumbnail, o desktop busca isso como `Blob` autenticado
(`authedRequestBlob`, já existe da Fase 3) e usa
`URL.createObjectURL` para o `<video src>`.

### Editar o `EditPlan`

Novo endpoint `services/api/src/routes/editPlans.routes.ts`:

`PATCH /clips/:id/edit-plan` — corpo com o `EditPlan` inteiro (`title`,
`segments`, `captions`, `zooms`, `sfx`, `music`, `watermark`). Numa
transação:
- Atualiza a linha `EditPlan`.
- Atualiza `Clip.startTime`/`endTime` para bater com `segments[0]`.
- 400 se `Clip.status !== "APPROVED"`.
- Mesmo isolamento de ownership de todo o resto
  (`clip → vod → streamer → userId`).
- Valida cada caminho de arquivo (`sfx[].filePath`, `music.filePath`,
  `watermark.filePath`): extensão permitida + existência real via
  `fs.stat` — mesmo padrão da criação de VOD (Fase 3).

## Testes

- **API**: real Postgres + ownership + validação de arquivo (extensão +
  `fs.stat`) + guard de `status === "APPROVED"` — mesmo padrão de
  `vods.routes.ts`/`clips.routes.ts`. `GET /vods/:id/video` testado com um
  arquivo real gerado por FFmpeg (mesmo padrão do teste de thumbnail).
- **Lógica pura de overlay** (`getActiveCaption`, `getZoomScale`): dados
  sintéticos, sem vídeo real.
- **Componentes de edição** (`CaptionEditor`, `ZoomEditor`, `SfxEditor`,
  `MusicPicker`, `WatermarkPicker`, `TrimControls`): React Testing
  Library, seletor de arquivo nativo mockado.
- **`VideoPreview`**: `jsdom` não decodifica vídeo de verdade — o teste
  dispara o evento `timeupdate` manualmente com um `currentTime`
  simulado e confirma que os overlays certos aparecem/somem.
- **`EditorPage`**: integração com API mockada, confirmando que Salvar
  monta o payload certo a partir do estado editado.

## Fora de escopo (Fase 5B e além)

- Render real do vídeo final (FFmpeg: crop/scale pra 9:16, queima de
  legenda, zoompan, mixagem de áudio, overlay de marca d'água).
- Preview idêntico ao render final.
- Múltiplos cortes não-contínuos por clipe.
- Biblioteca embutida de SFX/música.
- Consertar o campo `Streamer.logoUrl` órfão.
- Exportação do arquivo final (isso é consequência natural de o render
  existir na Fase 5B — o arquivo já fica em `storage/`).
