# Segurança

Situação de cada item da SPEC §26 na versão 0.1.0. Base: a checklist oficial de segurança do Electron.

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
| 10 | Markdown seguro nas respostas de IA | Fase 3 | — |
| 11 | Segredos com `safeStorage`; logs com redação | Logs ✅ · segredos na Fase 4 | `src/main/logging/redact.ts` |
| 12 | Higiene de dependências: lockfile, `npm ci`, `npm audit` no CI, Dependabot | ✅ | `.github/workflows/ci.yml`, `.github/dependabot.yml` |
| 13 | Assinatura de código | Pendente (D5) | — |
| 14 | Corretor ortográfico sem download de dicionários | ✅ | `disableSpellcheckerDownloads` no evento `session-created` |

## Notas

- **Corretor ortográfico.** Por padrão, o Chromium baixa um dicionário (`en-us-10-2.bdic`) de `redirector.gvt1.com` toda vez que o app abre. Isso foi detectado com `--log-net-log` e corrigido: o corretor é desligado no `session-created`, a lista de idiomas é esvaziada e o endereço de download aponta para um endereço local inválido. O teste E2E "privacidade" falha se qualquer requisição `http(s)`/`ws(s)` aparecer no log de rede.
- **Menor privilégio no IPC.** A janela do personagem não pode alterar configurações nem abrir links. Só a janela de Configurações pode.
- **Ganchos de teste.** Existem apenas com `CLIPSTER_E2E=1`, ficam em `globalThis` do main process e não são acessíveis por nenhum renderer (não há canal IPC de teste).
- **DevTools** ficam desligadas no app empacotado.
- **E2E e Fuses.** Os testes E2E rodam o build não empacotado. Com os Fuses, o app empacotado recusa `--inspect`, que o Playwright usa, e esse é o comportamento desejado.
