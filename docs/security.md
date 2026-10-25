# Segurança

Situação de cada item da SPEC §26 na versão 0.3.0. Base: a checklist oficial de segurança do Electron.

| # | Item | Situação | Onde |
|---|------|----------|------|
| 1 | `contextIsolation`, `sandbox`, `nodeIntegration: false`, `webSecurity` em todas as janelas; sem `<webview>` | ✅ | `src/main/windows/webPreferences.ts` (única fonte das preferências) |
| 2 | Sem conteúdo remoto; protocolo `app://clipster/` no lugar de `file://`, com proteção contra path traversal | ✅ | `src/main/app/protocol.ts`, `protocolPath.ts` (testado em `tests/unit/security.test.ts`) |
| 3 | CSP estrita em produção; CSP de desenvolvimento só com o necessário para o HMR | ✅ | `src/main/security/csp.ts`. Produção: cabeçalho do handler `app://`. Dev: `webRequest.onHeadersReceived`. |
| 4 | IPC: lista explícita de canais, remetente validado (URL do frame + papel da janela), payload validado com Zod, envelope sem stack trace | ✅ | `src/main/ipc/registry.ts`, `handlers.ts` (testado em `tests/integration/ipc.test.ts`) |
| 5 | Navegação, redirecionamentos e janelas novas bloqueados | ✅ | `src/main/security/hardening.ts` |
| 6 | Permissões web (câmera, microfone etc.) negadas | ✅ | `hardenSession` |
| 7 | URLs externas: só `http(s)`, sem credenciais, analisadas com `URL`, abertas só por ação do usuário | ✅ | `src/main/security/urls.ts` |
| 8 | Sem `eval`/`new Function`; nada executado a partir do renderer | ✅ | ESLint: `no-eval`, `no-implied-eval`, `no-new-func` |
| 9 | Electron Fuses no app empacotado | ✅ | `electron-builder.yml` (`electronFuses`). Verificado com `@electron/fuses read` e testando que `ELECTRON_RUN_AS_NODE` não funciona. |
| 10 | Markdown seguro nas respostas de IA: sem HTML bruto, sem imagens, links só por clique e validados no main | ✅ | `src/renderer/balloon/Markdown.tsx` (`react-markdown` com `skipHtml`, sem `rehype-raw`, sem `dangerouslySetInnerHTML`). E2E com `/simular markdown`. |
| 11 | Segredos com `safeStorage`; logs com redação | Logs ✅ · segredos na Fase 4 | `src/main/logging/redact.ts` |
| 12 | Higiene de dependências: lockfile, `npm ci`, `npm audit` no CI, Dependabot | ✅ | `.github/workflows/ci.yml`, `.github/dependabot.yml` |
| 13 | Assinatura de código | Pendente (D5) | — |
| 14 | Corretor ortográfico sem download de dicionários | ✅ | `disableSpellcheckerDownloads` no evento `session-created` |

## Notas

- **Corretor ortográfico.** Por padrão, o Chromium baixa um dicionário (`en-us-10-2.bdic`) de `redirector.gvt1.com` toda vez que o app abre. Isso foi detectado com `--log-net-log` e corrigido: o corretor é desligado no `session-created`, a lista de idiomas é esvaziada e o endereço de download aponta para um endereço local inválido. O teste E2E "privacidade" falha se qualquer requisição `http(s)`/`ws(s)` aparecer no log de rede.
- **Menor privilégio no IPC.** Cada janela só usa os canais do seu papel: o personagem não altera configurações, não abre links e não conversa; o balão conversa, mas não mexe no personagem nem apaga o histórico; apagar o histórico só pelas Configurações. Testado em `tests/integration/ipc.test.ts` e no E2E "menor privilégio".
- **Markdown seguro.** As respostas passam por `react-markdown` com `skipHtml` (HTML vira nada; o texto dentro das tags fica como texto). Imagens nunca são carregadas: viram "[imagem: descrição]". Links só para `http(s)` sem credenciais; o clique é tratado pelo balão, que pede ao main para abrir no navegador padrão, e o main valida de novo. O título do link mostra o domínio. Um teste E2E envia uma resposta com `javascript:`, `<script>`, `onerror` e imagem remota e confere que nada disso chega ao DOM.
- **Área de transferência.** O botão Copiar usa um canal IPC próprio (`clipboard:writeText`, só o balão, com limite de tamanho) e o `clipboard` do main. As permissões web continuam todas negadas, inclusive as de área de transferência. Nada lê a área de transferência.
- **Conversa no main.** A conversa, o provider e os tempos-limite ficam no main. O balão envia só o texto (até 4.000 caracteres, validado no balão e no main) e recebe eventos. Erros chegam como código; o texto amigável sai do i18n, sem stack trace.
- **Simulações de erro** (`/simular …`) só existem fora do app empacotado ou com `CLIPSTER_E2E=1`.
- **Ganchos de teste.** Existem apenas com `CLIPSTER_E2E=1`, ficam em `globalThis` do main process e não são acessíveis por nenhum renderer (não há canal IPC de teste).
- **DevTools** ficam desligadas no app empacotado.
- **E2E e Fuses.** Os testes E2E rodam o build não empacotado. Com os Fuses, o app empacotado recusa `--inspect`, que o Playwright usa, e esse é o comportamento desejado.
