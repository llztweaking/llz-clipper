# LLZ CLIPPER — Logo e animação (design)

Data: 2026-08-31
Status: aprovado pelo usuário, pronto para plano de implementação

## Contexto

O sistema de design visual (paleta "neon restrito", tokens, ícones)
está completo e mergeado em `master`. Esta spec cobre uma segunda fase,
pedida separadamente pelo usuário depois de ver o resultado rodando: uma
logo para o app (que não existia em lugar nenhum do repositório) e uma
camada de animação mais expressiva do que o `:hover`/`:focus` padrão que
a fase anterior deliberadamente limitou.

Direção validada com o usuário via mockups reais no companheiro visual
(3 conceitos de logo comparados lado a lado; dois níveis de animação
demonstrados **ao vivo**, com CSS real rodando no navegador, não
imagens estáticas) — o usuário escolheu deliberadamente o nível mais
expressivo dos dois demonstrados, inclusive depois de eu sinalizar o
risco de distração em telas densas.

## Decisões de design

- **Logo: ícone + wordmark.** Um triângulo de "play" em gradiente ao
  lado de "LLZ" (branco) + "CLIPPER" (gradiente) — a opção testada e
  escolhida entre três (wordmark puro; ícone+wordmark; marca-ícone
  isolada). Vira um componente `<Logo>` reutilizável.
- **Animação no nível mais expressivo, em todo o app, sem reserva pra
  telas densas.** O usuário optou explicitamente por isso depois de ver
  as duas opções rodando ao vivo e de eu sinalizar o trade-off — não é
  uma omissão de escopo, é a escolha feita com o risco already exposto.
  Três técnicas, cada uma reaproveitando seletores já existentes da fase
  anterior (sem duplicar regras):
  1. Gradiente em movimento contínuo nos botões primários
     (`.btn-primary`) + leve `scale()` no hover, substituindo o glow
     estático atual.
  2. "Brilho que atravessa" + leve elevação ao passar o mouse em todo
     card em repouso (`.streamer-card`, `.vod-card`, `.clip-card`, e o
     grupo já compartilhado dos 5 painéis do editor).
  3. Orbes flutuantes atrás do `<h1>` de **toda** tela (incluindo a de
     login), não só como um momento único de destaque.
- **Skeleton loader substitui o texto `"Carregando…"`.** Extensão
  natural da camada de micro-interação demonstrada (nível 1) — ganho de
  UX real, não só decorativo. Afeta 8 pontos no código atual (não 5,
  como estimei na conversa — contagem exata abaixo), e nenhum teste
  existente precisa mudar: o único teste que referencia esse texto
  (`SettingsPage.test.tsx:75`) verifica *ausência* depois do
  carregamento terminar, o que continua válido não importa o que
  substitua o texto durante o carregamento.
- **Ícone do app no Windows é atualizado**, usando a marca-ícone
  isolada (a terceira opção mostrada, não escolhida pra logo interna,
  mas reaproveitada aqui — um símbolo precisa funcionar sozinho em
  tamanhos pequenos, o que a logo com wordmark não faz). Gerado via
  `npx tauri icon` (CLI já disponível, `@tauri-apps/cli` já é
  dependência do projeto) a partir de uma imagem de origem em alta
  resolução — sem adicionar nova dependência de processamento de
  imagem.

## Componente `<Logo>`

Novo componente em `apps/desktop/src/components/Logo.tsx`, SVG inline
(mesmo padrão dos ícones `lucide-react` já usados na sidebar — sem
dependência de arquivo de imagem externo para a versão usada dentro do
app):

```tsx
interface LogoProps {
  size?: "sm" | "lg";
}
```

- `size="sm"`: usado em `.sidebar-title`, substituindo o texto puro
  `LLZ CLIPPER` que existe hoje.
- `size="lg"`: usado no `<h1>` da tela de login, com os orbes
  flutuantes atrás (ver seção de animação).

O ícone de "play" e o texto usam `--accent-gradient` (o mesmo token já
definido); nenhum token novo é necessário.

## Animação — seletores afetados

Todos os efeitos usam `@keyframes`/`transition` puros em CSS,
adicionados a `apps/desktop/src/styles/global.css` (mesmo arquivo único
já estabelecido) — nenhuma biblioteca de animação, nenhuma dependência
nova, consistente com a fase anterior.

- `.btn-primary`: gradiente ganha `background-size` maior +
  `animation` de `background-position` contínua; hover ganha
  `transform: scale(1.05)` além do glow já existente.
- `.streamer-card`, `.vod-card`, `.clip-card`, e o seletor já agrupado
  `.caption-editor, .zoom-editor, .sfx-editor, .music-picker,
  .watermark-picker`: ganham um pseudo-elemento de brilho que atravessa
  no `:hover` (`::before` com gradiente diagonal, `transform:
  translateX` animado) + `transform: translateY()` sutil.
- Um novo wrapper (`.page-title-orbs` ou similar) atrás de todo `<h1>`
  de página — 2 elementos `::before`/`::after` com gradiente radial e
  `@keyframes` de flutuação, igual ao demonstrado.
- Um novo `.skeleton-line` (mesmo efeito de shimmer demonstrado)
  substituindo os 8 usos de `<p>Carregando…</p>`/`<div
  className="app-loading">Carregando…</div>` em: `App.tsx`,
  `AdminPage.tsx`, `ClipsPage.tsx`, `SettingsPage.tsx` (2 ocorrências,
  uma por aba), `EditorPage.tsx`, `StreamersPage.tsx`, `VodPage.tsx`.

## Ícone do app (Windows)

`apps/desktop/src-tauri/tauri.conf.json`'s `bundle.icon` já aponta pra
`icons/32x32.png`, `icons/128x128.png`, `icons/128x128@2x.png`,
`icons/icon.icns`, `icons/icon.ico` — arquivos padrão do scaffold do
Tauri (`icons/` já tem o conjunto completo, incluindo variantes
`Square*Logo.png`/`StoreLogo.png` do template do Windows). O plano de
implementação gera uma imagem de origem 1024×1024 da marca-ícone
isolada e roda `npx tauri icon <origem.png>` a partir de
`apps/desktop/src-tauri/`, que sobrescreve todos os arquivos existentes
em `icons/` com o conjunto novo — nenhuma edição manual de
`tauri.conf.json` é necessária (os caminhos já apontam pros nomes que
o comando gera). A imagem de origem é gerada pela sessão que orquestra
o plano (não por um subagente implementador), já que produzir um PNG
em alta resolução a partir do SVG da marca exige o navegador — mesmo
padrão já usado na fase anterior pra verificação visual final.

## Testes

- `<Logo>`: um smoke test confirmando que renderiza sem lançar exceção
  e que `size="sm"`/`size="lg"` produzem saídas distintas — código
  novo, não CSS, então merece teste.
- Animações puramente decorativas (`.btn-primary`, cards, orbes): sem
  asserção de teste, mesmo padrão da fase anterior — verificadas
  visualmente pela sessão que orquestra o plano, não por Vitest.
- Skeleton loader: como troca `<p>` por outro elemento, cada uma das 7
  telas afetadas pode ganhar uma asserção nova confirmando que o
  skeleton aparece durante o carregamento (via `data-testid` ou
  `aria-busy`) — mas nenhum teste **existente** precisa ser alterado,
  confirmado pela busca acima.

## Fora de escopo

- Tema claro (herdado da fase anterior, continua fora).
- Mudança de layout/navegação/fluxo.
- Ícones do macOS/Linux gerados pelo Tauri não são testados em
  execução real (o projeto é Windows-only) — só o `.ico` do Windows é
  verificado visualmente; os demais formatos são gerados pelo mesmo
  comando mas não verificados.
- Animação de transição entre rotas/páginas (ex: fade ao trocar de
  tela) — não foi demonstrada nem pedida, só os três efeitos
  específicos acima.
