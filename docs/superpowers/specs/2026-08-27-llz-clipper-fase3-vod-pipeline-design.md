# LLZ CLIPPER — Fase 3: Pipeline de VOD (design)

## Contexto

Fase 1 entregou o backend (auth, licenciamento, admin, streamers) e Fase 2 o
app desktop consumindo essa API. O schema Prisma já define `VOD` e `Job`
(com um `JobStatus` cobrindo todo o pipeline futuro: transcrição, análise,
detecção, render), mas nenhuma dessas entidades tem lógica real ainda, e
`services/worker` é só um placeholder que loga uma mensagem.

Esta spec cobre a **Fase 3**: o usuário consegue selecionar um VOD local no
desktop, o sistema copia o arquivo pro storage local, extrai metadados reais
via FFmpeg (duração, resolução, fps, codec) e gera uma thumbnail — tudo
através de um Job real processado por um worker real.

**Fora de escopo explicitamente**: transcrição, análise de áudio/vídeo,
detecção de momentos, scoring, edit plan, render de clipes (Fases 4-5). O
`JobStatus` do schema já contém esses estágios futuros, mas o worker desta
fase só implementa os estágios de ingestão — os demais continuam existindo
apenas como valores do enum, sem lógica.

## Ambiente já disponível

FFmpeg e ffprobe 9.0.1 já instalados e no PATH desta máquina (verificado na
Fase 1). PostgreSQL local com os modelos `VOD`/`Job` já migrados desde a
Fase 1.

## Novos pacotes

| Pacote | Responsabilidade |
|---|---|
| `packages/storage` | `StorageService` (interface) + `LocalStorageService` — copia arquivos para `storage/vods/`, com progresso reportado durante a cópia (stream, não `fs.copyFile`) |
| `packages/ffmpeg` | `VideoProcessor` (interface) + `FFmpegProcessor` — `probe(path)` via `ffprobe`, `generateThumbnail(path, outputPath, atSeconds)` via `ffmpeg`; detecta o binário via `FFMPEG_PATH` ou PATH do sistema |

## `services/worker` (implementação real)

Processo Node separado (`npm run dev -w @llz-clipper/worker`), faz polling
na tabela `Job` a cada poucos segundos (`setInterval`, ex: 3s):

```
loop:
  pega o Job mais antigo com status=QUEUED (se houver)
  marca imediatamente com um status de "em processamento" pra evitar
    pegar o mesmo job de novo no próximo tick
  currentStep = "Copiando arquivo"
    StorageService.copy(vod.sourcePath, destino) — atualiza Job.progress
    a cada alguns MB copiados
  currentStep = "Extraindo metadados"
    VideoProcessor.probe(destino) → preenche VOD.durationSec/width/height/
    fps/codec/sizeBytes
    VideoProcessor.generateThumbnail(destino, thumbPath, 5) →
    storage/thumbnails/{vodId}.jpg
  status = COMPLETED
```

**Recuperação ao iniciar**: qualquer `Job` que não esteja em
`QUEUED`/`COMPLETED`/`FAILED` (ou seja, ficou preso quando o worker anterior
caiu) é marcado `FAILED` com `error = "Interrompido — clique em tentar
novamente"`. Não há retomada de cópia parcial — mais simples e seguro.

**Falha de job**: qualquer exceção durante o processamento marca
`status=FAILED` com a mensagem de erro real (não genérica) em `Job.error`.

## Modelo de dados — ajuste necessário

O `VOD` atual assume `storagePath` já definido na criação. Como a cópia
acontece de forma assíncrona no worker, `storagePath` é preenchido só
quando o job termina a etapa de cópia. Isso exige tornar
`VOD.storagePath` opcional no schema (`String?`), com uma migration —
pequena mudança discutida aqui porque afeta um modelo já existente da
Fase 1.

## Endpoints (`services/api`)

```
POST   /vods              { streamerId, sourcePath, presetId? }
  → valida extensão (.mp4/.mkv/.mov/.webm) e existência de sourcePath (fs.stat)
  → cria VOD (storagePath=null) + Job (status=QUEUED)
  → 201 { vod, jobId } — não bloqueia esperando o processamento

GET    /vods               ?streamerId=  → lista VODs do usuário (join streamer)
GET    /vods/:id                          → detalhe + status do job mais recente
DELETE /vods/:id                          → remove registro + arquivo do storage (se existir)

GET    /jobs/:id           → { status, progress, currentStep, error }

GET    /system/ffmpeg-status → { available: boolean, version: string | null, path: string | null }
```

`sourcePath` é validado como pertencente ao usuário autenticado apenas no
sentido de existir no sistema de arquivos local — como a API e o desktop
rodam na mesma máquina de um único usuário, não há verificação adicional de
"dono do arquivo" (não se aplica a este modelo de deployment local).

## Tela VOD (desktop)

- Drag-and-drop + botão "Selecionar VOD" usando `@tauri-apps/plugin-dialog`
  para obter o caminho absoluto do arquivo escolhido
- Validação client-side imediata: extensão do arquivo (a existência já é
  garantida pelo próprio file picker do SO)
- Formulário: Streamer (dropdown dos já cadastrados via `/streamers`),
  Preset (campo de texto livre, como já existe em Streamers)
- "Adicionar VOD" → `POST /vods` → navega para lista de VODs
- Lista de VODs: cada card mostra nome do arquivo, streamer, e:
  - Durante processamento: barra de progresso + `currentStep`, atualizado
    via polling em `GET /jobs/:id` a cada ~2s
  - Ao completar: duração/resolução/fps/tamanho reais, thumbnail
  - Se falhar: mensagem de erro inline + botão "Tentar novamente" (cria um
    novo Job para o mesmo VOD via um novo endpoint `POST /vods/:id/retry`)
  - Botão excluir (com confirmação, seguindo o padrão já estabelecido em
    Streamers na Fase 2)

## Configurações → aba Processamento

Consome `GET /system/ffmpeg-status`, somente leitura:
- Disponível: "FFmpeg encontrado — versão 9.0.1"
- Indisponível: "FFmpeg não encontrado. Configure a variável de ambiente
  `FFMPEG_PATH` apontando para o executável e reinicie a API."

Sem seletor de arquivo pela UI nesta fase — troca de caminho via variável
de ambiente do backend.

## Erros

- VOD com extensão inválida ou `sourcePath` inexistente: rejeitado em
  `POST /vods` antes de criar qualquer registro, erro inline no formulário.
- Job falha (FFmpeg trava, disco cheio, etc.): `FAILED` com mensagem real,
  card mostra erro + "Tentar novamente".
- Worker reinicia com jobs presos: marcados `FAILED` com mensagem clara
  (ver seção do worker acima).
- FFmpeg ausente ao rodar um job: falha imediata com mensagem clara, não
  trava o worker.

## Testes

- `packages/storage`: cópia real contra diretório temporário, verificando
  progresso reportado e conteúdo final byte-a-byte.
- `packages/ffmpeg`: testes reais contra um vídeo pequeno gerado on-the-fly
  (`ffmpeg -f lavfi -i testsrc -t 1 ...`) — sem mock, FFmpeg real está
  disponível nesta máquina.
- `services/worker`: integração contra o Postgres de teste — cria Job
  QUEUED, roda o processamento, verifica transições de status e
  recuperação de jobs presos ao iniciar.
- `services/api`: mesmo padrão das Fases 1-2 (Fastify `inject` + Postgres
  real).
- `apps/desktop`: Vitest + RTL para seleção/validação/polling, mockando a
  API (sem exercitar FFmpeg real do lado do desktop).

## Fora de escopo (fases futuras)

- Transcrição, análise de áudio/vídeo, detecção de contexto, scoring
  (Fase 4)
- Edit Plan, editor, preview, render de clipes, exportação (Fase 5)
- Seletor de caminho do FFmpeg pela UI (troca via variável de ambiente por
  enquanto)
- Retomada de cópia parcial de arquivo após falha (reinicia do zero via
  "Tentar novamente")
- Processamento de múltiplos VODs em paralelo pelo worker (um job por vez,
  suficiente para o uso de um único usuário nesta fase)
