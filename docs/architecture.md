# Arquitetura

Visão do código como está na versão 0.6.0 (Fases 0 a 6). A especificação completa está em [`SPEC.md`](../SPEC.md) §17–§19.

## Processos

```
┌────────────────────────────── main process (Node + Electron) ──────────────────────────────┐
│ index.ts ─ instância única, protocolo app://, endurecimento, logger, SettingsStore          │
│ AppController ─ comandos (menus, IPC, atalho, testes) → efeitos; reage a mudanças de config│
│   ├─ CharacterWindow + CharacterStateHost (máquina de estados, 2 timers)                   │
│   ├─ BalloonWindow (pré-criada, segue o personagem, altura dinâmica)                       │
│   ├─ AssistantService ─ ContextBuilder ─ PersonalityManager ─ ProviderRegistry             │
│   │     ├─ AIProvider: Demo · compatível com OpenAI (fetch + SSE) · Anthropic (SDK)       │
│   │     └─ ToolExecutor ─ ToolRegistry · PermissionManager (concessões, pedido, auditoria)│
│   ├─ SecretStore (chaves cifradas com safeStorage em secrets.json)                         │
│   ├─ HistoryStore (só com "Salvar histórico")                                              │
│   ├─ SettingsWindowManager (sob demanda)                                                   │
│   ├─ TrayController + menuFactory (bandeja e menu de contexto vêm da mesma fábrica)        │
│   └─ IpcRegistry + handlers (lista explícita de canais, remetente e payload validados)     │
└──────▲───────────────────────────────▲───────────────────────────────────▲──────────────────┘
       │ IPC                           │ IPC (chat:*, balloon:*)           │ IPC
┌──────┴─────────┐            ┌────────┴─────────┐                ┌────────┴───────┐
│ character.html │            │ balloon.html     │                │ settings.html  │
│ TS + SVG + CSS │            │ React + Markdown │                │ React          │
└────────────────┘            └──────────────────┘                └────────────────┘
        (cada janela tem o mesmo preload: window.clipster, API mínima)
```

## Pastas

| Pasta | Conteúdo |
|-------|----------|
| `src/main/app` | `controller.ts` (orquestração), `diagnostics.ts` (resumo de "Copiar diagnóstico", sem dados pessoais), `protocol.ts`/`protocolPath.ts` (`app://`), `loginItem.ts`, `pages.ts`, `applicationMenu.ts`, `testHooks.ts` |
| `src/main/character` | `characterStateHost.ts`: roda a máquina de estados com os timers |
| `src/main/ai` | `assistantService.ts` (conversa, requisição única, tempos-limite, agrupamento de pedaços), `contextBuilder.ts`, `personalityManager.ts`, `errors.ts`, `types.ts` (`AIProvider`), `providerRegistry.ts` (escolhe o provider, prontidão, chaves, modelos, testar conexão), `providers/openaiCompatible.ts`, `providers/anthropic.ts`, `providers/shared.ts` (SSE, erros HTTP → §23), `providers/demo/` (repertório, simulações) |
| `src/main/tools` | `registry.ts` (ferramentas desta execução, definições para o modelo), `executor.ts` (validação → permissão → execução com tempo-limite → auditoria), `types.ts` (`defineTool`, Zod → JSON Schema), `builtin/` (`getCurrentTime`, `getClipsterVersion`), `dev/` (ferramentas fictícias de teste) |
| `src/main/permissions` | `permissionManager.ts`: escopos por risco, concessões "nesta sessão" (memória) e "sempre" (`settings.json`), pedido pendente com prazo, Revogar |
| `src/main/windows` | `characterWindow.ts`, `balloonWindow.ts`, `settingsWindow.ts`, `placement.ts` e `balloonPlacement.ts` (funções puras de posição), `displays.ts`, `webPreferences.ts` |
| `src/main/menus` | `menuFactory.ts` (descrição pura dos menus) e `electronMenu.ts` (conversão) |
| `src/main/ipc` | `registry.ts` (validação central) e `handlers.ts` (canais do Apêndice C) |
| `src/main/storage` | `settingsStore.ts`, `settingsRecovery.ts` (leitura tolerante e migrações), `historyStore.ts`, `secretStore.ts` (chaves de API), `atomicWrite.ts` |
| `src/main/security` | `csp.ts`, `hardening.ts`, `urls.ts` |
| `src/main/logging` | `logger.ts` (JSON Lines, rotação) e `redact.ts` |
| `src/preload` | `api.ts` (constrói `window.clipster`) e `index.ts` |
| `src/renderer/character` | Página do personagem: `controller.ts` (interface), `svgRigController.ts` (adaptador do formato svg-rig), `packs/` (pacote de arte em uso) |
| `src/renderer/balloon` | Balão (React): `BalloonApp`, `Header` (visor), `Conversation`, `Composer`, `Onboarding`, `Markdown` (seguro), `chatState.ts` (estado puro, testado) e `chatClient.ts` |
| `src/renderer/settings` | Página de Configurações (React); `AiSection.tsx` (provider, servidor, chave, modelo, testar conexão) |
| `src/renderer/lib` | `settingsClient.ts` (configurações espelhadas do main), `errorReporting.ts` |
| `src/shared` | Esquemas Zod, i18n, canais e tipos de IPC, constantes, utilitários puros; `character/` (estados e máquina de estados), `ai/` (tipos da conversa, endereços e prontidão dos providers), `personalities/` (prompts e falas), `errors/` (códigos e textos de erro) |
| `assets/` | SVGs originais. `assets/character/<pacote>/`: `manifest.json`, rig SVG e `poses.css` |
| `resources/` | PNGs usados em tempo de execução (bandeja, ícone da janela) |
| `build/` | Ícone usado pelo electron-builder |

## Fluxos principais

### Inicialização

1. Define a pasta de dados (`Clipster (dev)` em desenvolvimento, temporária em E2E).
2. Registra o protocolo `app://` como privilegiado e desliga o corretor ortográfico no `session-created` (evita download de dicionários).
3. Pede o lock de instância única. Se outra instância existe, ela é mostrada e esta sai.
4. No `ready`: logger, endurecimento da sessão, handler do `app://`, `SettingsStore.load()`, `SecretStore.load()` (o `safeStorage` só funciona depois do `ready`; em desenvolvimento, o `.env` entra como reserva).
5. `AppController.start()`: IPC, janela do personagem (`showInactive`, sem roubar foco), bandeja.

### Arrasto

1. `pointerdown` sobre a silhueta → o renderer guarda `screenX/screenY` e captura o ponteiro.
2. Passando de 4 DIP → `character:dragStart`; o main guarda os bounds iniciais.
3. A cada quadro (`requestAnimationFrame`) → `character:dragMove { dx, dy }` com o deslocamento **total** desde o início. O main aplica `setBounds` com tamanho fixo, limitado à área útil do monitor sob o centro.
4. `pointerup` → `character:dragEnd`; após 500 ms a posição é salva (absoluta + relativa à área útil do monitor).
5. Abaixo de 4 DIP, o gesto é um clique (`character:click`).

### Estados do personagem

```
evento (clique, arrasto, personalidade, inatividade, IA…)
  → CharacterStateHost.dispatch (main)
      → transition(snapshot, evento)   ← função pura, src/shared/character/stateMachine.ts
      → timer transitório: schedule / cancel / keep
      → interação do usuário? reinicia o contador de inatividade
  → pose mudou? webContents.send('character:view', { state, badge })
  → janela: controller.setView() → data-state / data-badge no #character → poses.css
```

Eventos ligados hoje: `APP_READY`, `CLICK`, `DRAG_START`/`DRAG_END`, `SUCCESS_FEEDBACK` (troca de personalidade e segunda instância), `INACTIVITY_TIMEOUT`, `BALLOON_OPENED`/`BALLOON_CLOSED`, `USER_TYPING`, `MESSAGE_SENT`, `FIRST_TOKEN`, `STREAM_DONE`, `CANCELLED`, `AI_ERROR`, `PREVIEW` (dev). Os de aviso (`NOTIFICATION*`) serão ligados quando houver notificações.

### Uma mensagem (SPEC §17.2)

```
Balão: Enter → chat:send { text }                (só a janela de papel "balloon")
  → AssistantService.send
      → valida (vazio, 4.000 caracteres, uma por vez, provider configurado)
      → guarda a pergunta + resposta vazia ("streaming") → chat:event start → MESSAGE_SENT
      → ContextBuilder: base + personalidade + idioma + ambiente + histórico (20 msgs / 12k chars)
      → ProviderRegistry: provider do momento + modelo + chave (decifrada só aqui, no main)
      → AIProvider.streamResponse (Demo; compatível com OpenAI: POST /chat/completions com SSE;
        Anthropic: messages.create com stream) → erros HTTP/SDK viram os códigos da §23
      → "thinking" (raciocínio) zera o cronômetro do 1º pedaço, sem mostrar nada
      → pedaços agrupados a cada 40 ms → chat:event delta   (1º pedaço → FIRST_TOKEN)
      → fim → chat:event done → STREAM_DONE → histórico (se ligado)
  Parar → chat:cancel → AbortController → "interrompida" → CANCELLED
  30 s sem 1º pedaço ou 120 s no total (servidor local: 90 s / 5 min) → TIMEOUT → AI_ERROR
```

O balão nunca recebe texto de erro do main, só o código (`ChatErrorInfo`); a frase sai do i18n, no tom da personalidade quando a §23 permite.

### Balão

1. Pré-criado escondido 1,5 s depois de iniciar; depois só é mostrado/escondido.
2. Abrir por ação do usuário (clique, menu, bandeja, atalho) → `show()` + foco no campo. Primeira execução → `showInactive()`, sem foco.
3. O balão mede a própria altura (`ResizeObserver`) e manda `balloon:resize`; o main limita ao máximo, calcula a posição com `placeBalloon` (função pura: acima e à esquerda; inverte se faltar espaço; limita à área útil) e devolve `balloon:placement` (lado e posição do rabicho).
4. Arrasto do personagem, troca de monitores e mudança de escala → reposiciona.
5. Fechar (botão, `Esc`, `Alt+F4`) só esconde; uma resposta em andamento continua.

### Mudança de configuração

`settings:update` (só janelas de UI) → `SettingsStore.update` valida e grava (debounce, escrita atômica) → `onChange` → `AppController` aplica efeitos (sempre visível, escala, login item, menus) e transmite `settings:changed` às janelas. Mudanças só de posição não são transmitidas.

### Ferramenta (SPEC §22)

```
Provider → tool-call { id, name, input }                       (input ainda não confiável)
  → AssistantService: conta (máx. 5 por mensagem), para o relógio da IA
  → ToolExecutor
      → ToolRegistry.get(name)            nome desconhecido → erro para o modelo
      → inputSchema (Zod)                 argumentos inválidos → erro para o modelo
      → PermissionManager.request         sem permissões → segue; concedida antes → segue;
          senão: chat:event tool { status: 'awaiting', prompt } → balão mostra o pedido
                 personagem: PERMISSION_REQUESTED → aviso
                 permissions:respond (balão) / 2 min sem resposta / Parar → decisão
      → execute (10 s)                    → resultado em JSON, cortado em 8.000 caracteres
      → log tool.audit                    (decisão e sucesso, sem argumentos)
  → nova rodada do provider com toolRounds (resultado tratado como dado)
  → texto final → done
```

O balão nunca decide nada: mostra o pedido e manda a escolha. O main confere se o pedido existe e se a escolha cabe no risco.

### Chave de API (SPEC §21)

```
Configurações: "Salvar chave" → secrets:set { provider, value, allowInsecure? }   (só a janela de Configurações)
  → SecretStore: valida, cifra com safeStorage, grava secrets.json (com a origem, no compatível com OpenAI)
  → responde só { hasKey, hint: "1234", secureBackend, … }; a chave nunca volta
  → ai:status para balão e Configurações (o balão troca "Falta a chave" pelo campo de texto)
Sem cofre (Linux basic_text): sem allowInsecure → INSECURE_STORAGE; a tela pede "Entendo o risco".
```

### Monitores

Eventos `display-added`, `display-removed` e `display-metrics-changed` (com debounce) → `ensureVisible` recoloca o personagem dentro de uma área útil.

## Contrato de IPC

Canais em `src/shared/ipc/channels.ts`, payloads em `payloads.ts` e `schemas/conversation.ts`, tipos de resposta por canal em `api.ts` (`IpcInvokeResponses`). Papéis autorizados por canal em `src/main/ipc/handlers.ts`:

| Canal | Tipo | Janelas autorizadas |
|-------|------|---------------------|
| `settings:get` | invoke | todas |
| `settings:update` | invoke | configurações e balão |
| `character:*` (arrasto, clique, menu, clique-através) | send | personagem |
| `character:getView` | invoke | personagem |
| `character:view` | evento main → personagem | — |
| `chat:send`, `chat:cancel`, `chat:retry`, `chat:conversation:get`, `chat:conversation:new` | invoke | balão |
| `chat:typing` | send | balão |
| `chat:event` | evento main → balão | — |
| `chat:history:clear` | invoke (`{ confirmed: true }`) | configurações |
| `onboarding:complete` | invoke | balão |
| `windows:balloon:close` | invoke | balão |
| `balloon:resize` | send | balão |
| `balloon:placement`, `balloon:shown` | evento main → balão | — |
| `clipboard:writeText` | invoke | balão |
| `windows:settings:open`, `windows:hideClipster`, `app:info`, `app:quit` | invoke | todas |
| `shell:openExternal` | invoke | configurações e balão |
| `secrets:set`, `secrets:clear`, `secrets:status`, `ai:models:list`, `ai:connection:test` | invoke | configurações |
| `ai:status:get` | invoke | configurações e balão |
| `ai:status` | evento main → balão e configurações | — |
| `permissions:respond` | invoke | balão |
| `permissions:list`, `permissions:revoke` | invoke | configurações |
| `permissions:changed` | evento main → configurações | — |
| `diagnostics:openLogs`, `diagnostics:copy` | invoke | configurações |
| `log:write` | send | todas |
| `settings:changed`, `windows:settings:navigate` | evento main → renderer | — |
