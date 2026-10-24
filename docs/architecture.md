# Arquitetura

Visão do código como está na versão 0.2.0 (Fases 0, 1 e 2). A especificação completa está em [`SPEC.md`](../SPEC.md) §17–§19.

## Processos

```
┌──────────────────────────── main process (Node + Electron) ─────────────────────────────┐
│ index.ts ─ instância única, protocolo app://, endurecimento, logger, SettingsStore       │
│ AppController ─ comandos (menus, IPC, testes) → efeitos; reage a mudanças de config     │
│   ├─ CharacterWindow  (transparente, arrasto, clique-através, posição)                  │
│   ├─ SettingsWindowManager (sob demanda)                                                 │
│   ├─ TrayController + menuFactory (bandeja e menu de contexto vêm da mesma fábrica)     │
│   └─ IpcRegistry + handlers (lista explícita de canais, remetente e payload validados)  │
└───────────────▲─────────────────────────────────────────────────────────▲───────────────┘
                │ IPC (invoke / send / eventos)                           │
        ┌───────┴────────┐                                       ┌────────┴───────┐
        │ preload        │  window.clipster (API mínima)         │ preload        │
        │ renderer:      │                                       │ renderer:      │
        │ character.html │  TypeScript puro + SVG + CSS          │ settings.html  │  React
        └────────────────┘                                       └────────────────┘
```

## Pastas

| Pasta | Conteúdo |
|-------|----------|
| `src/main/app` | `controller.ts` (orquestração), `protocol.ts`/`protocolPath.ts` (`app://`), `loginItem.ts`, `pages.ts`, `applicationMenu.ts`, `testHooks.ts` |
| `src/main/character` | `characterStateHost.ts`: roda a máquina de estados com os timers |
| `src/main/windows` | `characterWindow.ts`, `settingsWindow.ts`, `placement.ts` (funções puras de posição), `displays.ts`, `webPreferences.ts` |
| `src/main/menus` | `menuFactory.ts` (descrição pura dos menus) e `electronMenu.ts` (conversão) |
| `src/main/ipc` | `registry.ts` (validação central) e `handlers.ts` (canais do Apêndice C) |
| `src/main/storage` | `settingsStore.ts`, `settingsRecovery.ts` (leitura tolerante e migrações), `atomicWrite.ts` |
| `src/main/security` | `csp.ts`, `hardening.ts`, `urls.ts` |
| `src/main/logging` | `logger.ts` (JSON Lines, rotação) e `redact.ts` |
| `src/preload` | `api.ts` (constrói `window.clipster`) e `index.ts` |
| `src/renderer/character` | Página do personagem: `controller.ts` (interface), `svgRigController.ts` (adaptador do formato svg-rig), `packs/` (pacote de arte em uso) |
| `src/renderer/settings` | Página de Configurações (React) |
| `src/shared` | Esquemas Zod, i18n, canais e tipos de IPC, constantes, utilitários puros; `character/` com os estados e a máquina de estados |
| `assets/` | SVGs originais. `assets/character/<pacote>/`: `manifest.json`, rig SVG e `poses.css` |
| `resources/` | PNGs usados em tempo de execução (bandeja, ícone da janela) |
| `build/` | Ícone usado pelo electron-builder |

## Fluxos principais

### Inicialização

1. Define a pasta de dados (`Clipster (dev)` em desenvolvimento, temporária em E2E).
2. Registra o protocolo `app://` como privilegiado e desliga o corretor ortográfico no `session-created` (evita download de dicionários).
3. Pede o lock de instância única. Se outra instância existe, ela é mostrada e esta sai.
4. No `ready`: logger, endurecimento da sessão, handler do `app://`, `SettingsStore.load()`.
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

Eventos ligados hoje: `APP_READY`, `CLICK`, `DRAG_START`/`DRAG_END`, `SUCCESS_FEEDBACK` (troca de personalidade), `INACTIVITY_TIMEOUT`, `PREVIEW` (dev). Os de IA, balão e avisos já existem na máquina e serão ligados nas Fases 3–5.

### Mudança de configuração

`settings:update` (só janelas de UI) → `SettingsStore.update` valida e grava (debounce, escrita atômica) → `onChange` → `AppController` aplica efeitos (sempre visível, escala, login item, menus) e transmite `settings:changed` às janelas. Mudanças só de posição não são transmitidas.

### Monitores

Eventos `display-added`, `display-removed` e `display-metrics-changed` (com debounce) → `ensureVisible` recoloca o personagem dentro de uma área útil.

## Contrato de IPC

Canais em `src/shared/ipc/channels.ts`, payloads em `payloads.ts`, tipos de resposta por canal em `api.ts` (`IpcInvokeResponses`). Papéis autorizados por canal em `src/main/ipc/handlers.ts`:

| Canal | Tipo | Janelas autorizadas |
|-------|------|---------------------|
| `settings:get` | invoke | todas |
| `settings:update` | invoke | configurações (e o futuro balão) |
| `character:*` (arrasto, clique, menu, clique-através) | send | personagem |
| `character:getView` | invoke | personagem |
| `character:view` | evento main → renderer | — |
| `windows:settings:open`, `windows:hideClipster`, `app:info`, `app:quit` | invoke | todas |
| `shell:openExternal` | invoke | configurações (e o futuro balão) |
| `diagnostics:openLogs` | invoke | configurações |
| `log:write` | send | todas |
| `settings:changed`, `windows:settings:navigate` | evento main → renderer | — |
