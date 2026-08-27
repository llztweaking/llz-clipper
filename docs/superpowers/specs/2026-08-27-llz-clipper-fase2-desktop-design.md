# LLZ CLIPPER — Fase 2: Desktop Shell (design)

## Contexto

A Fase 1 (`docs/superpowers/specs/2026-08-27-llz-clipper-fase1-fundacao-design.md`)
entregou o backend real: API Fastify com autenticação por key, licenciamento
(mensal/trimestral), admin (gerar/revogar keys, logs) e CRUD de streamers,
todos rodando contra PostgreSQL local.

Esta spec cobre a **Fase 2**: o app desktop Windows (Tauri + React +
TypeScript) que consome essa API. É a primeira vez que existe uma
interface gráfica de verdade para o produto — o usuário deve conseguir
abrir o app, ativar uma key, navegar pela sidebar, gerenciar streamers e
(se admin) gerenciar keys.

VOD, Clips e Editor não têm backend ainda (Fases 3–5) — aparecem na
sidebar como placeholders "em breve", não como funcionalidades reais.

## Ambiente já disponível

Node 22, Rust (toolchain GNU `stable-x86_64-pc-windows-gnu`) e GCC/MinGW já
instalados e no PATH nesta máquina (ver Fase 1). Isso é o suficiente para
compilar um app Tauri v2 no Windows.

## Stack

| Camada | Escolha | Justificativa |
|---|---|---|
| Framework desktop | Tauri v2 | Pedido no spec original do produto; versão atual e estável |
| Bundler frontend | Vite | Padrão de fato para Tauri + React |
| Linguagem | TypeScript | Consistência com o resto do monorepo |
| Roteamento | React Router (`HashRouter`) | Evita problemas de roteamento com o protocolo customizado do Tauri |
| Estado global | Zustand | Leve, sem boilerplate |
| Estilo | CSS puro com custom properties (design tokens) | Controle total do visual dark/minimalista sem framework de utilidades |
| HTTP | `fetch` nativo envolto num `apiClient` com refresh automático em 401 | Sem dependência extra |

## Estrutura de pastas

```
apps/desktop/
  src-tauri/
    src/
      main.rs
      commands/
        hwid.rs        # get_hwid()
        session.rs     # save_session / load_session / clear_session (crate `keyring`)
    Cargo.toml
    tauri.conf.json
  src/
    pages/
      LoginPage.tsx
      StreamersPage.tsx
      SettingsPage.tsx
      AdminPage.tsx
      ComingSoonPage.tsx
    components/
      Sidebar.tsx
      StreamerForm.tsx
      StreamerCard.tsx
      KeyTable.tsx
      OfflineBanner.tsx
      SessionExpiredModal.tsx
    hooks/
      useAuth.ts
      useStreamers.ts
    stores/
      authStore.ts
    services/
      apiClient.ts
      authApi.ts
      streamersApi.ts
      adminApi.ts
    styles/
      tokens.css
      global.css
    App.tsx
    main.tsx
  package.json
  vite.config.ts
  index.html
```

## Autenticação e sessão

### HWID

Gerado no lado Rust (nunca no JS, para não ser falsificável trivialmente
pelo próprio usuário): lê `HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`
via a crate `winreg`, exposto como comando Tauri `get_hwid() -> String`.
O frontend chama isso uma única vez, na tela de ativação.

### Armazenamento seguro do refresh token

Comandos Tauri em Rust usando a crate `keyring` (acessa o Windows
Credential Manager nativamente, por usuário do SO):

```rust
save_session(refresh_token: String) -> Result<(), String>
load_session() -> Result<Option<String>, String>
clear_session() -> Result<(), String>
```

O frontend nunca grava o refresh token em disco diretamente — sempre passa
pelos comandos Tauri.

### Fluxo de abertura do app

```
Abrir app
  → invoke("load_session")
    → token encontrado:
        POST /auth/refresh
          → 200: guarda novo accessToken em memória (Zustand), entra no painel
          → 401/erro: invoke("clear_session"), mostra tela de login
    → token não encontrado:
        mostra tela de login/ativação
```

### Tela de login/ativação

Um único formulário com toggle entre dois modos:
- **Ativar licença** (`code`, `email`, `password`) → `POST /auth/activate-key`
  (com `hwid` obtido via `get_hwid()`)
- **Entrar** (`email`, `password`) → `POST /auth/login`

Em ambos os casos, sucesso chama `invoke("save_session", { refreshToken })`
e guarda `accessToken` + dados do usuário no `authStore` (Zustand, em
memória — nunca persistido em disco pelo frontend).

### Renovação automática de access token

`apiClient` intercepta qualquer resposta `401`:
1. Tenta `POST /auth/refresh` uma vez com o refresh token guardado.
2. Sucesso: atualiza o `accessToken` no `authStore` e repete a requisição original.
3. Falha: `invoke("clear_session")`, limpa o `authStore`, exibe o
   `SessionExpiredModal` e redireciona para a tela de login.

## Navegação e sidebar

`HashRouter`, sidebar sempre visível após login:

```
🎥 VOD            → /vod            (ComingSoonPage)
🔥 CLIPS          → /clips          (ComingSoonPage)
🎬 EDITOR         → /editor         (ComingSoonPage)
👤 STREAMERS      → /streamers      (funcional)
⚙️ CONFIGURAÇÕES  → /settings       (funcional)
🛠 ADMIN          → /admin          (funcional; só renderiza no sidebar se authStore.user.role === "ADMIN")
```

`ComingSoonPage` recebe o nome da seção via prop de rota e mostra uma
mensagem indicando que a funcionalidade chega em fase futura — nunca uma
tela em branco.

## Telas funcionais

### Streamers (`/streamers`)

- `GET /streamers` ao montar a página → lista em cards (nome, username,
  preset como texto livre — a entidade `Preset` não tem endpoint próprio
  ainda, então fica um campo de texto simples por enquanto)
- "+ Novo Streamer" abre `StreamerForm` (modal) → `POST /streamers`
- Editar em um card → `StreamerForm` preenchido → `PUT /streamers/:id`
- Excluir em um card → confirmação inline → `DELETE /streamers/:id`

### Configurações (`/settings`)

Abas:
- **Conta** (funcional): email, plano (`MONTHLY`/`QUARTERLY`), status da
  licença, data de expiração, hwid do dispositivo vinculado (via
  `GET /auth/me`), botão "Sair" (revoga sessão local: `POST /auth/logout`
  + `invoke("clear_session")`)
- **Geral / Processamento / IA**: placeholders "em breve" (dependem das
  Fases 3–4: pasta de saída, workers, FFmpeg path, provider de IA)

### Admin (`/admin`, somente `role === "ADMIN"`)

- Botões "Gerar Key" (modal: escolher plano), "Gerar 10 Keys", "Gerar 50
  Keys" → `POST /admin/keys` / `POST /admin/keys/bulk`
- `KeyTable`: lista paginada de `GET /admin/keys` com filtro por
  status/plano/busca, botão copiar código, botão revogar
  (`POST /admin/keys/:id/revoke`)
- Aba de logs: lista paginada de `GET /admin/logs`

Uma rota `/admin` acessada diretamente por um usuário não-admin (ex:
editando a URL manualmente, já que é um `HashRouter` local) deve
redirecionar para `/streamers` — a proteção real já existe no backend
(403), isso é só para não mostrar uma tela quebrada no frontend.

## Erros e estados

- **API offline**: `apiClient` captura falhas de rede (fetch rejeitado) e
  ativa `OfflineBanner` fixo ("Servidor indisponível — tentando
  reconectar"); ações que dependem da API ficam desabilitadas com essa
  mensagem visível, nunca um loading infinito.
- **Erros de formulário**: mensagem inline usando o `error`/`message` que
  a API já retorna (key inválida/expirada/revogada/já vinculada, validação
  de campos) — nunca uma mensagem genérica.
- **Sessão morta em uso**: `SessionExpiredModal` bloqueante com botão único
  "Voltar ao login" quando o refresh automático falha.
- Toda ação assíncrona (submit de formulário, revogar key, excluir
  streamer) tem estado de loading local no próprio botão — nenhum botão
  fica sem resposta visual.

## Estilo

`styles/tokens.css` define a paleta via custom properties:

```css
:root {
  --bg: #0d0d0f;
  --surface: #17171a;
  --border: #2a2a2e;
  --text: #f2f2f3;
  --text-muted: #9a9aa0;
  --accent: #5b8cff;
}
```

Preto/grafite/branco/cinza dominam; `--accent` é o único tom de cor,
usado com moderação (botões primários, links, indicadores de status).
Layout único: sidebar fixa à esquerda (grafite, `--surface`), conteúdo à
direita (`--bg`), reaproveitado em todas as telas internas. Sem
gradientes, sem animações decorativas, sem gráficos.

## Testes

- **Vitest + React Testing Library**, mockando `apiClient`/`fetch`:
  - `useAuth`: ativação de key, login, refresh automático em 401,
    logout, sessão expirada
  - `StreamersPage`: listar, criar, editar, excluir
  - `AdminPage`: gerar key única/em lote, revogar, filtrar
  - Sidebar: item "ADMIN" só aparece para `role === "ADMIN"`
  - `apiClient`: retry após refresh bem-sucedido vs. falha definitiva
- **Rust (`src-tauri`)**: sem testes automatizados nesta fase — os
  comandos de HWID/keyring são finos o bastante para verificar
  manualmente rodando `tauri dev` contra a API local; mockar o Windows
  Credential Manager não compensa o esforço aqui. `cargo check` roda como
  parte da verificação de build.

## Build

`npm run tauri build` (dentro de `apps/desktop`) gera o instalador Windows
via NSIS (bundler padrão do Tauri no Windows): `LLZ-CLIPPER-Setup.exe`.

## Fora de escopo (fases futuras)

- Qualquer funcionalidade real em `/vod`, `/clips`, `/editor` (Fases 3–5)
- Tela de configuração de FFmpeg (Fase 3)
- Edição de `Preset` como entidade própria (fica texto livre em Streamers
  por enquanto)
- Indicador visual online/offline granular por serviço (seção 41 do spec
  original do produto) — o `OfflineBanner` cobre o caso essencial
  (API inacessível)
- Testes automatizados do lado Rust/Tauri além de `cargo check`
