# LLZ CLIPPER — Redesign visual do app desktop (design)

Data: 2026-08-30
Status: aprovado pelo usuário, pronto para plano de implementação

## Contexto

As 5 fases funcionais do spec original estão completas e mergeadas em
`master`: ingestão de VOD, detecção de clipes por IA, editor manual, e
render real via FFmpeg. O app funciona de ponta a ponta, mas a UI é
funcional sem tratamento visual dedicado — uma única paleta escura plana
(`apps/desktop/src/styles/tokens.css`: `--bg`, `--surface`, `--border`,
`--text`, `--text-muted`, `--accent`, `--danger`), sem escala tipográfica,
sem escala de espaçamento consistente, e ícones de navegação são emojis
(`apps/desktop/src/components/Sidebar.tsx`).

Esta spec cobre um **sistema de design completo** aplicado por cima da
estrutura de telas já existente (sidebar + área de conteúdo, 7 páginas,
~17 componentes) — **sem mudar layout, navegação ou fluxo**. Direção
visual explorada e validada com o usuário via mockups: uma identidade
"neon" escura — gradiente magenta→roxo→azul como acento de marca, com o
brilho/glow reservado para destaques específicos, não aplicado em toda
superfície.

## Decisões de design

- **Neon restrito, não neon em tudo**: o gradiente/glow aparece só em
  botão primário de cada tela, link ativo da sidebar, card/linha em
  estado "em andamento" (Job/Render rodando), e borda de input em foco.
  Todo o resto (texto padrão, bordas, cards em repouso) fica numa base
  neutra e calma. Essa regra foi validada visualmente comparando as duas
  abordagens numa tela densa (lista de streamers) — "neon em tudo" cansa
  em uso prolongado, "neon nos destaques" mantém a identidade sem
  comprometer legibilidade.
- **Erro não usa o acento neon**: `--danger` é uma cor própria, sem
  glow — o brilho fica reservado para ação/progresso positivo, não para
  estado de erro. Evita diluir o significado do acento.
- **Só tema escuro**: o conceito de glow/neon só funciona de verdade em
  fundo escuro; um tema claro exigiria repensar a identidade do zero.
  Sem plano de tema claro nesta fase.
- **Tipografia do sistema, sem fonte própria**: mantém a pilha atual
  (`-apple-system, "Segoe UI", sans-serif`) — sem dependência nova, sem
  risco de licenciamento, carregamento instantâneo. O impacto visual vem
  de uma escala de peso/tamanho bem definida, não da fonte em si.
- **Ícones SVG via `lucide-react`** substituindo os emojis da sidebar —
  única dependência nova desta fase. Biblioteca leve, tree-shakeable,
  sem custo de licença.
- **Sem mudança de layout/navegação**: a estrutura sidebar + conteúdo,
  as rotas, e a organização de cada tela permanecem exatamente como
  estão. Esta fase troca só a "pele" (cores, tipografia, espaçamento,
  ícones, tratamento de estado) por cima do que já existe.

## Tokens de design

Substituem/estendem `apps/desktop/src/styles/tokens.css` por completo:

```css
:root {
  /* Cores base */
  --bg: #0c0c10;
  --surface: #151519;
  --surface-raised: #1a1a20;
  --border: #232329;
  --border-accent: #5a2fa3;
  --text: #f2f2f5;
  --text-muted: #9a9aa4;

  /* Acento (gradiente de marca) */
  --accent-start: #ff2ec4;
  --accent-mid: #7c3bff;
  --accent-end: #3b8bff;
  --accent-gradient: linear-gradient(90deg, var(--accent-start), var(--accent-mid), var(--accent-end));

  /* Semântico */
  --danger: #ff4d6a;
  --success: #3ddc84;

  /* Glow (só em elementos de destaque, ver "Regra de aplicação") */
  --glow-sm: 0 0 12px -2px rgba(255, 46, 196, 0.6);
  --glow-md: 0 0 24px -4px rgba(255, 46, 196, 0.55), 0 0 24px -4px rgba(59, 139, 255, 0.4);

  /* Tipografia */
  --font-size-xs: 12px;
  --font-size-sm: 13px;
  --font-size-base: 14px;
  --font-size-lg: 16px;
  --font-size-xl: 20px;
  --font-size-2xl: 28px;
  --font-weight-regular: 400;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --font-weight-extrabold: 800;

  /* Espaçamento (grade de 4px) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* Raios */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
}
```

`--danger`/`--success` são cores novas — hoje só `--danger` existe (com
um valor diferente, `#e5555f`); o novo valor (`#ff4d6a`) foi escolhido
para conviver com o magenta do acento sem competir com ele visualmente.
`--success` não existe hoje — necessário para estados de conclusão
(ex: clipe renderizado com sucesso) que atualmente reaproveitam a classe
`.clip-status-approved` sem uma cor semântica própria.

## Regra de aplicação do acento neon

O `--accent-gradient` + `--glow-sm`/`--glow-md` aparecem **somente**
nestes casos, em qualquer tela:

1. Botão primário da tela (ex: "Renderizar", "Salvar alterações",
   "Aprovar", "Ativar").
2. O link ativo (`.sidebar-link.active`) na sidebar.
3. Um card/linha cujo estado é "em andamento" — `Job`/`Render` com
   status `QUEUED`/`UPLOADING`/`PROCESSING_AUDIO`/.../`RENDERING` (ou
   seja, qualquer status não-terminal das duas máquinas de estado já
   existentes).
4. Borda de `input`/`textarea`/`select` quando em foco (`:focus`) — usa
   `border-color: var(--accent-mid)` sólido (não um gradiente literal na
   borda, que exigiria `border-image` e complica com `border-radius`)
   junto com `--glow-sm`. O efeito visual de "acender" é o mesmo; só a
   borda em si não é multi-cor.
5. O título `<h1>` da tela de login (`.login-page h1`) — um `text-shadow`
   sutil com `--glow-sm`. É o único texto de marca que existe fora da
   sidebar, na primeira tela que o usuário vê antes mesmo de autenticar;
   confirmado visualmente durante a implementação como um efeito sutil e
   intencional, não um vazamento da regra — mas só foi documentado aqui
   depois (a implementação já tinha esse `text-shadow` desde a Fase 4 do
   plano; esta seção não o listava explicitamente até a revisão final).

Em qualquer outro elemento — cards em repouso, texto padrão, bordas de
tabela, botões secundários — a superfície usa só `--surface`/`--border`/
`--text`, sem gradiente nem glow. Estados de erro usam `--danger` puro
(sem glow); estados de sucesso/concluído usam `--success` puro (sem
glow) — o brilho fica reservado para ação primária e progresso, não
para todo estado semântico.

## Ícones

Nova dependência: `lucide-react`. Mapeamento da sidebar
(`apps/desktop/src/components/Sidebar.tsx`), substituindo os emojis
atuais um a um:

| Item | Emoji atual | Ícone novo |
|---|---|---|
| VOD | 🎥 | `Video` |
| CLIPS | 🔥 | `Flame` |
| EDITOR | 🎬 | `Film` |
| STREAMERS | 👤 | `Users` |
| CONFIGURAÇÕES | ⚙️ | `Settings` |
| ADMIN | 🛠 | `Shield` |

Cada ícone recebe `aria-label` correspondente ao `label` do item de
navegação, para que os testes (ver "Testes" abaixo) consigam localizá-lo
sem depender de conteúdo textual de emoji.

## Escopo

Aplica-se às 7 páginas existentes (`LoginPage`, `StreamersPage`,
`SettingsPage`, `AdminPage`, `VodPage`, `ClipsPage`, `EditorPage`) e aos
componentes existentes (`Sidebar`, `VodCard`, `ClipCard`, `StreamerForm`,
`KeyTable`, `OfflineBanner`, `SessionExpiredModal`, e os 7 componentes de
`components/editor/`). O trabalho é: reescrever `tokens.css` com os
valores acima, atualizar `global.css` (estilos compartilhados de
`button`/`input`/`.sidebar-link`/`.modal`/etc. para usar a nova escala e
a regra de acento restrito), e ajustar classes/estilos inline pontuais em
componentes que hoje não usam os tokens compartilhados (ex: barras de
progresso em `VodCard.tsx`/`ClipCard.tsx`, que precisam refletir a regra
de "em andamento = acento", não uma cor fixa qualquer). Nenhuma rota,
nenhum componente novo de layout, nenhuma mudança de comportamento.

## Testes

Como é uma mudança majoritariamente visual (CSS + troca de ícones), os
testes existentes continuam validando exatamente o mesmo comportamento —
com uma exceção real: `Sidebar.test.tsx` hoje provavelmente localiza
itens de navegação pelo texto do emoji; isso precisa passar a usar
`aria-label` (ou o texto do `label`, que não muda) já que um ícone SVG
não carrega esse texto. Nenhum teste de lógica de negócio (API, worker,
estados) é afetado — só testes de desktop que fazem asserção sobre
conteúdo visual específico (emoji, cor inline) precisam de ajuste pontual
onde existirem.

## Fora de escopo

- Tema claro.
- Mudança de layout, navegação, ou fluxo de qualquer tela.
- Identidade de marca (logo, nome do produto) — já descartado
  explicitamente pelo usuário como não sendo o objetivo desta fase.
- Site ou material de marketing — idem.
- Animações/transições elaboradas (além do que `:hover`/`:focus`
  padrão de CSS já cobre) — pode ser considerado numa fase futura, não
  nesta.
- Ilustrações customizadas ou imagens de marca.
