# Clipster

Um pequeno companheiro de desktop, animado, com personalidade e foco em privacidade. Ele fica num canto da tela, pode ser arrastado, e conversa com você num balão. Por enquanto as respostas vêm do modo demonstração; na próxima versão, da IA que você escolher.

> Inspirado nos assistentes de desktop dos anos 90, com identidade própria. **Não afiliado à Microsoft.**

<p align="center">
  <img src="docs/images/balloon.png" alt="O Clipster, um prendedor de papel com visor, com o balão de conversa aberto respondendo como renomear um arquivo, nos temas claro e escuro" width="620">
</p>

## Estado atual

Versão **0.3.0**: Fases 0, 1, 2 e 3 do [roadmap](SPEC.md#34-roadmap) concluídas.

| Recurso | Situação |
|---------|----------|
| Personagem transparente, sem moldura, fora da barra de tarefas | ✅ |
| Arrastar o personagem; posição lembrada, inclusive com vários monitores | ✅ |
| Clique através das áreas transparentes (Windows/macOS) | ✅ |
| Ícone na bandeja e menu de contexto (clique direito) | ✅ |
| Configurações: idioma, sempre visível, iniciar escondido, iniciar com o sistema, atalho global, personalidade, tamanhos, animações, tema, histórico | ✅ |
| Interface em português e inglês, seguindo o idioma do sistema | ✅ |
| Uma única instância; fechar ≠ sair | ✅ |
| Estados animados do personagem (10 poses, máquina de estados) | ✅ |
| Cochila depois de um tempo sem interação; acorda confuso ao ser clicado | ✅ |
| **Balão de conversa** com respostas aparecendo aos poucos, botão Parar e Copiar | ✅ |
| **Modo demonstração**: respostas de exemplo, sem IA e sem internet | ✅ |
| **Prestativo / Espirituoso** com troca rápida no balão | ✅ |
| **Primeira execução guiada** (idioma, personalidade, IA) | ✅ |
| Histórico de conversas opcional (desligado por padrão) | ✅ |
| IA de verdade (Ollama/LM Studio, Claude, OpenAI) | Fase 4 |
| Ferramentas com permissões | Fase 5 |

## Conversando com o Clipster

- **Abrir o balão:** clique no personagem, use "Conversar com o Clipster" no clique direito, clique no ícone da bandeja (Windows) ou ligue o atalho global em Configurações › Geral (`Ctrl+Shift+Espaço`).
- **Teclado:** `Enter` envia, `Shift+Enter` quebra a linha, `Esc` para a resposta ou fecha o balão.
- **Personalidade:** troque no próprio balão (Prestativo | Espirituoso), na bandeja ou nas Configurações. A conversa continua; a próxima resposta já vem no tom novo.
- **Modo demonstração:** responde a algumas perguntas de exemplo (renomear arquivo, captura de tela, copiar e colar, que horas são, quem é você), para o seu sistema operacional, em português ou inglês. Fora disso, ele avisa que precisa de uma IA configurada. Sempre aparece com o selo **Demo**.
- **Histórico:** desligado por padrão; sem ele, a conversa dura até "Nova conversa" ou até fechar o app. Ligado em Configurações › Privacidade, fica só no seu computador e a última conversa volta quando você reabre o Clipster.

**Em desenvolvimento**, o modo Demo aceita comandos que simulam problemas, para ver as mensagens de erro sem gastar nada: `/simular erro 429` (também 401, 404, 402, 529, 400), `/simular timeout` (espera os 30 s do tempo-limite), `/simular offline`, `/simular queda` (cai no meio da resposta) e `/simular markdown` (resposta com link perigoso, imagem e HTML, para conferir que nada disso passa). No app instalado, esses comandos não existem.

## Estados do personagem

<p align="center">
  <img src="docs/images/states.png" alt="Os 10 estados do Clipster sobre fundo escuro e claro: à disposição, ouvindo, pensando, falando, contente, confuso, dormindo, com problema, com aviso e sendo arrastado" width="760">
</p>

Quem decide o estado é uma máquina de estados no main process (`src/shared/character/stateMachine.ts`); a janela só desenha. No uso normal você vê: **ouvindo** enquanto digita, **pensando** até a primeira palavra da resposta, **falando** enquanto ela aparece, **com um problema** quando algo dá errado, **contente** na primeira execução e ao trocar de personalidade, **sendo arrastado** durante o arrasto, **dormindo** depois do tempo configurado em Configurações › Geral e **confuso** ao ser acordado com um clique. O estado **com um aviso** fica para as notificações (Fase 5 em diante).

**Para ver todos agora:** em `npm run dev`, clique com o botão direito no personagem › **Pré-visualizar estado (dev)**. Cada estado fica 4 segundos e volta sozinho. Esse submenu não existe no app instalado.

## Requisitos

- **Node.js 24 LTS** (mínimo 22.12). No Windows, baixe o instalador "LTS" em [nodejs.org](https://nodejs.org/).
- Windows 10/11, macOS ou Linux.

## Instalação para desenvolvimento

```bash
npm install
npm run dev
```

O `npm install` também baixa o Electron. O `npm run dev` abre o Clipster com recarga automática da interface. Em desenvolvimento os dados ficam numa pasta separada (`Clipster (dev)`), sem misturar com o app instalado.

## Scripts

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Abre o app em modo desenvolvimento (recarga automática). |
| `npm run build` | Compila main, preload e interface em `out/`. |
| `npm run preview` | Abre o build de produção localmente. |
| `npm run lint` | ESLint (regras estritas com tipos). |
| `npm run format` / `npm run format:check` | Prettier. |
| `npm run typecheck` | TypeScript estrito nos projetos node, web e e2e. |
| `npm test` | Testes unitários e de integração (Vitest). |
| `npm run test:e2e` | Build + testes E2E com Playwright controlando o Electron. |
| `npm run package` | Gera o instalador para o sistema atual em `release/`. Nunca publica nada. |
| `npm run package:win` | Gera o instalador do Windows (NSIS). |
| `npm run audit` | Auditoria das dependências de produção. |
| `npm run icons` | Regera os PNGs dos ícones a partir dos SVGs em `assets/icons`. |

## Testes

```bash
npm test            # unitários + integração
npm run test:e2e    # E2E (no Linux sem desktop: xvfb-run -a npm run test:e2e)
```

Os testes E2E rodam com `CLIPSTER_E2E=1` e uma pasta de dados temporária: nunca tocam nas suas configurações reais. Eles percorrem o cenário completo do MVP (SPEC §37) e verificam, pelo log de rede do Chromium, que o app não faz **nenhuma** requisição de rede ao abrir nem ao conversar no modo Demo.

Alguns comportamentos só podem ser verificados num desktop de verdade (transparência, bandeja, vários monitores). Para eles há o roteiro manual em [`docs/qa-checklist.md`](docs/qa-checklist.md).

## Empacotamento

```bash
npm run package       # sistema atual
npm run package:win   # Windows (rodar no Windows)
```

- **Windows:** instalador NSIS por usuário (não pede administrador).
- **macOS:** DMG. **Linux:** AppImage.
- O instalador não é assinado digitalmente (decisão D5 da SPEC). O Windows SmartScreen vai mostrar um aviso: clique em "Mais informações" › "Executar assim mesmo".
- No GitHub, o workflow **Build artifacts** (execução manual) gera o instalador do Windows sem publicar release.

## Arquitetura (resumo)

- **Main process** (`src/main`): janelas, bandeja, menus, configurações, IPC, segurança. É a única fonte da verdade das configurações.
- **Preload** (`src/preload`): expõe só `window.clipster`, uma API mínima e tipada. Nunca expõe o `ipcRenderer`.
- **Máquina de estados** (`src/shared/character`): função pura que decide a pose do personagem; roda no main com dois timers no máximo (transitório e inatividade).
- **Conversa** (`src/main/ai`): o `AssistantService` guarda a conversa no main, monta o contexto (`ContextBuilder`), fala com o provider pela interface `AIProvider` (hoje só o Demo) e envia os pedaços da resposta ao balão.
- **Personalidades** (`src/shared/personalities`): único lugar com prompts e falas do personagem.
- **Renderers** (`src/renderer`): o personagem (TypeScript puro, sem React por quadro; a arte é um pacote trocável em `assets/character/`), o balão (React, Markdown seguro) e as Configurações (React). Sem Node, sem acesso a arquivos, sem rede.
- **Shared** (`src/shared`): esquemas Zod, i18n, contratos de IPC, constantes.

Detalhes em [`docs/architecture.md`](docs/architecture.md). Decisões registradas em [`docs/decisions.md`](docs/decisions.md).

## Configuração de IA

Em Configurações › IA, hoje há duas opções: **Nenhuma** (o balão explica como configurar) e **Modo demonstração**. A Fase 4 acrescenta servidores locais compatíveis com OpenAI (Ollama, LM Studio) e provedores na nuvem (Claude, OpenAI), sempre com o modelo escolhido por você e a chave guardada no cofre do sistema.

## Privacidade

O Clipster não observa tela, teclado, área de transferência, arquivos ou outros programas, e não tem telemetria. Configurações, posição, logs e (se você ligar) o histórico ficam só no seu computador. Os logs nunca guardam o conteúdo das conversas. Detalhes em [`docs/privacy.md`](docs/privacy.md).

## Segurança

Isolamento de contexto, sandbox, CSP estrita, protocolo próprio `app://` no lugar de `file://`, IPC com remetente e conteúdo validados, navegação e janelas novas bloqueadas, permissões web negadas, respostas em Markdown sem HTML e sem imagens remotas, e Electron Fuses no app empacotado. Detalhes em [`docs/security.md`](docs/security.md).

## Limitações conhecidas

- **Linux:** o clique através das áreas transparentes não é suportado; a bandeja depende de AppIndicator; no Wayland, o arrasto e a restauração de posição não funcionam nativamente (ver [`docs/compatibility.md`](docs/compatibility.md)).
- **Iniciar com o sistema** só funciona no app instalado, no Windows e no macOS.
- Sem assinatura de código (avisos do SmartScreen e do Gatekeeper).
- O pacote `.deb` volta quando o projeto tiver um endereço público (decisão D6).
- O corretor ortográfico fica desligado no campo de texto do balão: ligá-lo faria o Chromium baixar dicionários da internet.
- O atalho global é fixo (`Ctrl+Shift+Espaço`, `⌘+Shift+Espaço` no macOS); escolher outro fica para uma próxima versão.

## Roadmap

Fases 4 a 6 em [`SPEC.md` §34](SPEC.md#34-roadmap). Próxima: **Fase 4 — IA real** (Ollama/LM Studio, Claude e OpenAI, chave no cofre do sistema, lista de modelos, testar conexão, mensagens de erro de verdade).

## Licença

A definir (decisão D1 da [SPEC](SPEC.md#03-decisões-pendentes-do-dono-do-produto)). Até lá, todos os direitos reservados.
