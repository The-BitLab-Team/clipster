# Registro de decisões

Decisões técnicas tomadas onde a SPEC deixava espaço, ou em que a implementação precisou se ajustar a ela. Formato: data · decisão · motivo · alternativas descartadas.

---

### 2026-10-24 · Versões da stack instaladas

| Pacote | Versão | Observação |
|--------|--------|------------|
| electron | 45.0.0 | Lançado em 21/10/2026. A 44.x continua suportada, caso surja regressão. |
| electron-vite | 6.0.0 | Primeira com suporte a Vite 8. |
| vite | 8.3.x | Rolldown como bundler. |
| react / react-dom | 19.3.x | Só na janela de Configurações. |
| typescript | 6.0.3 | Ver decisão abaixo. |
| zod | 4.6.x | Só no main/preload; fora do bundle do renderer. |
| vitest | 5.0.x | Config em `.mts` (carregamento nativo do Vite). |
| @playwright/test | 1.64.x | Controla o Electron via `_electron`. |
| eslint / typescript-eslint | 10.x / 8.72.x | `strictTypeChecked` + `stylisticTypeChecked`. |
| electron-builder | 26.18.x | — |
| Node (dev) | 24 LTS (`.nvmrc`); mínimo 22.12 | Vitest 5 e electron-vite 6 exigem ≥ 22.12. |

### 2026-10-24 · TypeScript 6.0 em vez de 7.0
**Motivo:** o `typescript-eslint` 8.72 exige `typescript <6.1.0`; com a 7.0 o lint com tipos não funciona. **Revisitar** quando o typescript-eslint suportar a 7.

### 2026-10-24 · Saída CommonJS para main e preload (sem `"type": "module"`)
**Motivo:** preloads com `sandbox: true` precisam ser um único arquivo CJS, e o electron-vite gera CJS por padrão sem `"type": "module"`. O preload é empacotado com `externalizeDeps: false`. **Descartado:** ESM no main (ganho pequeno, mais configuração).

### 2026-10-24 · electron-builder (SPEC §16.1)
Instalador NSIS por usuário no Windows, DMG no macOS, AppImage no Linux; Fuses configurados no próprio `electron-builder.yml`; `--publish never` em todos os scripts.

### 2026-10-24 · Linux só com AppImage por enquanto
**Motivo:** o alvo `.deb` exige `homepage`, que depende da decisão D6 (repositório). Volta quando houver um endereço público.

### 2026-10-24 · Store de configurações próprio, com recuperação campo a campo
**Motivo:** menos dependências e validação no mesmo padrão (Zod) do resto. Um campo inválido volta ao padrão sem derrubar os vizinhos; o arquivo original vira `settings.corrupt-<data>.json`. Campos ausentes não contam como erro (versões novas criam campos). **Descartado:** `electron-store` (outra camada de esquema, ESM-only).

### 2026-10-24 · Arrasto: deslocamento total vindo do renderer
O renderer envia o deslocamento **total** desde o início (`screenX/screenY`), uma vez por quadro; o main aplica `setBounds` com tamanho fixo a partir dos bounds iniciais. **Motivo:** mensagens perdidas não acumulam erro; `setBounds` com tamanho fixo evita que o Windows altere o tamanho ao cruzar monitores com DPI diferente; e o arrasto pode ser testado com eventos sintéticos no E2E. **Descartado:** o main lendo `screen.getCursorScreenPoint()` em intervalo (não testável com eventos sintéticos; mesma limitação no Wayland).

### 2026-10-24 · Clique através com hit test no renderer
Com `setIgnoreMouseEvents(true, { forward: true })`, o renderer recebe os movimentos do mouse, testa se o ponteiro está sobre a silhueta (`[data-hit]`) e liga/desliga o clique-através. No Linux a opção `forward` não existe: o recurso fica desligado e documentado.

### 2026-10-24 · Janela do personagem sem React
TypeScript puro, SVG e CSS, para não renderizar React por quadro (SPEC §5.5, §25). React só nas Configurações.

### 2026-10-24 · Ganchos de teste no main, não via IPC
A SPEC (Apêndice C) previa canais `test:*`. Os ganchos ficam em `globalThis.__clipsterTest` do main, só com `CLIPSTER_E2E=1`, e o Playwright os usa via `app.evaluate`. **Motivo:** nenhuma superfície nova de IPC exposta a renderers.

### 2026-10-24 · Os E2E abrem o app pela pasta do projeto
`electron <raiz-do-projeto>` em vez de `electron out/main/index.js`. **Motivo:** assim `app.getVersion()` lê o `package.json` (0.1.0), como no app instalado.

### 2026-10-24 · CSP por cabeçalho
Produção: cabeçalho no handler do `app://`. Dev: `webRequest.onHeadersReceived` só para a origem do Vite. Sem `<meta>`, para uma única fonte da política.

### 2026-10-24 · Corretor ortográfico desligado na criação da sessão
Detectado com `--log-net-log`: o Chromium baixava `en-us-10-2.bdic` de `redirector.gvt1.com` a cada inicialização. Desligar no `ready` chegava tarde. Agora, no evento `session-created`: corretor desligado, lista de idiomas vazia (Windows/Linux) e endereço de download local inválido. Um teste E2E garante zero requisições de rede.

### 2026-10-24 · Pasta de dados separada em desenvolvimento
`npm run dev` usa `Clipster (dev)`, para não misturar com o app instalado (e permitir rodar os dois ao mesmo tempo).

### 2026-10-24 · Logger próprio (JSON Lines + rotação)
~100 linhas, redação de segredos testada, rotação 1 MB × 3. **Descartado:** `electron-log` (dependência a mais para pouco ganho aqui).

### 2026-10-24 · Ícones gerados a partir de SVG
SVGs originais em `assets/icons`; PNGs gerados por `npm run icons` (Chromium do Playwright) e versionados. Bandeja com variantes @1.25x/@1.5x/@2x para DPI do Windows e versão "template" para o macOS.

### 2026-10-24 · Canal `windows:settings:navigate`
Evento novo (main → Configurações) para abrir uma seção específica quando a janela já está aberta. Acrescentado ao Apêndice C da SPEC.

### 2026-10-24 · Callbacks como propriedades nas interfaces
Interfaces com funções usam `nome: (x) => y` em vez de método (`nome(x): y`), para evitar problemas de `this` (regra `unbound-method`) e permitir dublês nos testes.
