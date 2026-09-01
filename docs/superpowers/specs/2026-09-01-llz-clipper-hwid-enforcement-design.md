# HWID enforcement no login (design)

Data: 2026-09-01
Status: aprovado pelo usuário, pronto para plano de implementação

## Contexto

O schema já tem um model `Device` (`hwid` único) e `LicenseKey.deviceId`
(FK opcional). `activateKey` (`services/api/src/services/licenseService.ts`)
já vincula o dispositivo na primeira ativação: cria/encontra o `Device`
pelo `hwid` recebido e grava `LicenseKey.deviceId`. Até aqui, o "1 HWID
por key" parece garantido.

O problema real: **`POST /auth/login` não recebe nem verifica `hwid` —
só `email`/`password`** (`services/api/src/services/authService.ts`).
Depois da primeira ativação, as mesmas credenciais fazem login em
qualquer número de máquinas, sem nenhuma checagem de dispositivo. O
vínculo `LicenseKey.deviceId` gravado na ativação nunca é lido de volta
no login — ele existe, mas não é aplicado. Esta spec fecha essa lacuna.

## Decisões de arquitetura

- **`hwid` passa a ser obrigatório em `POST /auth/login`**, mesmo padrão
  já usado em `POST /auth/activate-key`. O desktop já sabe obter o HWID
  real via `invoke("get_hwid")` (usado hoje só em `activate()` dentro de
  `apps/desktop/src/hooks/useAuth.ts`) — `login()` passa a fazer a mesma
  chamada.
- **Checagem acontece só no login, não em `/auth/refresh`**: o token de
  acesso/refresh emitido continua válido pelo próprio prazo normal depois
  de um login bem-sucedido. Resetar o dispositivo de uma key (abaixo) não
  revoga sessões já emitidas — só afeta o próximo login. Mantém o escopo
  mínimo: a trava é "para logar de novo, precisa ser o dispositivo certo",
  não "toda requisição prova o dispositivo".
- **Vínculo nulo = primeiro bind, não erro.** Se a key ativa do usuário
  tem `deviceId: null` (nunca passou pelo fluxo real de ativação — cobre
  o único caso real disso no ambiente de dev/QA hoje, uma key semeada
  direto no banco para testes; e também cobre uma key que acabou de ser
  resetada por um admin), o login com qualquer `hwid` faz o bind agora:
  encontra ou cria o `Device` pelo `hwid` recebido, grava
  `LicenseKey.deviceId`, e segue. Não existe um caminho separado de
  "bypass para QA" — é o mesmo caminho que uma key resetada usa.
- **Vínculo presente e `hwid` bate**: login segue normal, sem mudança de
  comportamento.
- **Vínculo presente e `hwid` não bate**: login recusado com
  `403 hwid_mismatch`, mensagem "Esta licença já está em uso em outro
  dispositivo." — sem re-vincular automaticamente.
- **Reset de dispositivo é uma ação manual de admin**, não algo que o
  próprio usuário aciona (evita que qualquer pessoa com a senha destrave
  a key em outra máquina sozinha). Novo endpoint `POST
  /admin/keys/:id/reset-device` limpa `LicenseKey.deviceId` (`null`) — o
  `Device` antigo não é apagado, só fica sem key apontando pra ele (mesmo
  padrão "sem cascade" já usado no resto do schema, ex. `Streamer.logoUrl`
  órfão, renders sem cleanup automático de arquivo até a correção recente).
  Sem efeito em sessões já ativas (ver acima) — só o próximo login usa o
  vínculo novo.

## Modelo de dados

Nenhuma migration necessária — `Device`/`LicenseKey.deviceId` já existem
com exatamente os campos precisos.

## API (`services/api`)

- **`POST /auth/login`**: schema (`services/api/src/routes/auth.routes.ts`)
  ganha `hwid: z.string().min(1)`, igual ao de `activate-key`.
  `login(email, password, hwid)` (`authService.ts`) passa a, depois de
  validar credenciais e achar a `activeKey`:
  1. Se `activeKey.deviceId` é `null`: `findOrCreate` o `Device` pelo
     `hwid`, `update` a key com esse `deviceId`, seguir.
  2. Se `activeKey.deviceId` existe: carregar o `Device`, comparar
     `device.hwid === hwid`. Se bater, seguir. Se não, lançar
     `AuthError(403, "hwid_mismatch", "Esta licença já está em uso em
     outro dispositivo.")` antes de emitir qualquer token.
- **`POST /admin/keys/:id/reset-device`** (novo, mesmo arquivo/padrão de
  `POST /admin/keys/:id/revoke`): 404 se a key não existe, `update` para
  `deviceId: null`. `200` com a key atualizada (mesmo shape de resposta
  que `revoke` já usa).

## Desktop (`apps/desktop`)

- **`useAuth.ts`**: `login(email, password)` passa a chamar
  `invoke<string>("get_hwid")` (mesma chamada que `activate()` já faz) e
  incluir `hwid` no `authApi.login(...)`.
- **`authApi.ts`**: `login()` aceita `hwid` no input, mesmo shape de
  `activateKey()`.
- **`LoginPage.tsx`**: sem mudança de UI — o `hwid` é obtido internamente
  pelo hook, igual já acontece na ativação. O erro `hwid_mismatch` cai no
  mesmo tratamento genérico já existente (`err instanceof ApiError ?
  err.message : "Erro inesperado"`), então a mensagem do servidor já
  aparece automaticamente.
- **`KeyTable.tsx`**: novo botão "Resetar dispositivo" ao lado de
  "Revogar", visível quando `key.status === "ACTIVE"` (mesmo padrão de
  disabled/loading do botão de revogar). Chama o novo endpoint e recarrega
  a lista.
- **`adminApi.ts`**: nova função `resetDevice(id)`, mesmo padrão de
  `revokeKey(id)`.

## Testes

- **`services/api`**: `test/auth.test.ts` (ou onde já vivem os testes de
  login) ganha casos: login sem `hwid` no corpo → `invalid_body`; login
  com `hwid` novo numa key sem `deviceId` → sucesso e `deviceId` gravado;
  login com `hwid` igual ao já vinculado → sucesso; login com `hwid`
  diferente → `403 hwid_mismatch`, nenhum token emitido. Novo arquivo ou
  seção de testes para `POST /admin/keys/:id/reset-device`: reseta
  `deviceId` para `null`, 404 para key inexistente, e um teste de
  integração ponta a ponta (reset → login com HWID diferente do original
  → sucesso, prova que o reset realmente destrava).
- **`apps/desktop`**: `useAuth.test.ts` (se existir; senão, os testes de
  `LoginPage.test.tsx`) cobre que `login()` agora inclui `hwid` na
  chamada. `KeyTable` não tem arquivo de teste hoje (mesmo estado desta
  sessão de QA manual) — não é criado um novo só para este botão, mantendo
  consistência com o restante do componente.

## Fora de escopo nesta fase

- Checagem de `hwid` em `/auth/refresh` ou em qualquer rota autenticada
  além do login.
- Revogar sessões/refresh tokens ativos ao resetar um dispositivo.
- Usuário resetar o próprio dispositivo (self-service) — só admin.
- Limite de quantos resets um admin pode fazer, histórico/auditoria de
  resets além do `UsageLog` já existente (não é estendido aqui).
- Mudar o fluxo de `activate-key` — ele já faz o bind correto hoje.
