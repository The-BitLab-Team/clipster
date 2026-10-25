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

---

## Fase 2 — personagem

### 2026-10-24 · Formato de arte `svg-rig` (um SVG + CSS de poses)
Um único SVG com partes nomeadas (alças, visor, cinco tipos de olhos, cinco bocas, acessórios) e um `poses.css` que as mostra, esconde e move conforme `data-state`. **Motivo:** trocar de pose é só mudar um atributo; transições suaves entre poses saem de graça; um arquivo em vez de dez cópias do personagem. **Descartado:** um SVG por estado (como no exemplo original da SPEC), por duplicar a arte e não permitir transições.

### 2026-10-24 · `zod/mini` para validar o manifesto dentro da janela
A SPEC pede validação com Zod ao carregar. O `zod` completo ficaria pesado na janela do personagem; o `zod/mini` (API funcional, do próprio Zod 4) resolve. O mesmo esquema é usado no teste do pacote.

### 2026-10-24 · Máquina de estados pura em `shared`, host no main
`transition(snapshot, evento)` não tem efeitos colaterais: devolve o próximo estado, o comando para o timer transitório (`schedule`/`cancel`/`keep`) e se o evento foi interação do usuário. O `CharacterStateHost` no main mantém os dois únicos timers e envia `character:view` para a janela. A janela se inscreve **antes** de consultar `character:getView`, para não perder mudanças no meio.

### 2026-10-24 · Estado-base sempre `idle`; aviso pendente vira indicador
Quando a pose de aviso expira, o personagem volta a `idle` com um pontinho âmbar no visor (`badge`) até o aviso ser visto. **Motivo:** evitar que o personagem volte a "chamar atenção" depois de cada resposta (SPEC §2).

### 2026-10-24 · Inatividade bloqueada tenta de novo
Se o tempo de inatividade acaba num momento em que não dá para dormir (gerando resposta, balão aberto, aviso pendente), o contador recomeça. Assim o personagem dorme depois, mesmo sem nova interação.

### 2026-10-24 · Pré-visualização de estados descartável e só em desenvolvimento
Submenu "Pré-visualizar estado (dev)" no clique direito, apenas quando o app não está empacotado. A prévia dura 4 s; qualquer evento real a descarta e é tratado a partir de `idle` (sem isso, prever "dragging" e depois receber um evento deixava o personagem preso na pose; bug encontrado e coberto por teste).

### 2026-10-24 · Animações finitas em repouso
Loops infinitos só em `thinking` e `talking`, que duram segundos. "z" de dormir e pulso do aviso repetem 3 vezes e param. Verificado por teste do CSS e por E2E (`document.getAnimations()`).

### 2026-10-24 · Contorno escuro nas alças
As alças prateadas sumiam em fundos claros (papel de parede claro, barra de tarefas clara do Windows 11). Ganharam um contorno escuro no personagem e no ícone da bandeja.

### 2026-10-24 · Sono curto só em E2E
`CLIPSTER_E2E_SLEEP_AFTER_MS` substitui "Dormir depois de" apenas quando `CLIPSTER_E2E=1`, para testar o sono em segundos.

### 2026-10-24 · Versão 0.2.0
Personagem, máquina de estados e pré-visualização de estados (Fase 2).

---

## Fase 3 — conversa

### 2026-10-24 · `react-markdown` 10.1 + `remark-gfm` 4.0
Respostas de IA usam tabelas, listas e código com frequência; o GFM (tabelas, riscado, autolinks) é do mesmo projeto (unified/remark), maduro e mantido. Sem `rehype-raw` e com `skipHtml`: HTML vira nada. Ambos ficam só no bundle do balão.

### 2026-10-24 · Balão em janela própria, com altura informada pelo balão
O balão mede a própria altura e manda `balloon:resize`; o main ajusta a janela e a posição. Uma janela de altura fixa deixaria um retângulo transparente bloqueando cliques acima do personagem. **Escala do chat:** tamanho da fonte da raiz (1rem = 14 px × escala) e medidas em rem. **Descartado:** `webContents.setZoomFactor`, porque o zoom do Chromium vale por origem, e as três janelas usam a mesma origem (`app://clipster`).

### 2026-10-24 · Posição do balão em função pura; rabicho desenhado pelo balão
`placeBalloon` (acima e à esquerda; inverte na horizontal e/ou na vertical; limita à área útil do monitor do personagem) é testada em unidade com coordenadas negativas e monitores pequenos. O main envia `balloon:placement` (lado e posição da ponta) e o balão desenha o rabicho. Sem sobrepor a janela do personagem, para não depender de cliques passarem por pixels transparentes.

### 2026-10-24 · Primeira execução: balão de boas-vindas sem foco
1,2 s depois de o personagem aparecer, o balão abre com `showInactive()` no passo 1 do onboarding (SPEC §6.2 "happy + saudação" e §9). Não toma o foco; só um clique do usuário o faz. Fora da primeira execução, o balão nunca abre sozinho. O onboarding continua de onde parou se o balão for fechado.

### 2026-10-24 · Conversa no main, eventos para o balão
`AssistantService` guarda a conversa (sobrevive a fechar ou recarregar o balão). Eventos: `start` (pergunta + resposta vazia), `delta` (agrupado a cada 40 ms), `done`, `cancelled`, `error` e `reset` (troca da conversa inteira). Eventos de uma requisição vão só para a janela que pediu. O balão se inscreve antes de pedir a conversa; eventos que chegam antes da resposta já estão nela e são descartados (o main responde e emite na mesma fila, em ordem).

### 2026-10-24 · Canais além do Apêndice C original
- `chat:retry`: "Tentar de novo" refaz a última pergunta sem duplicá-la na conversa.
- `chat:typing` como `send` (sem resposta), não `invoke`.
- `balloon:resize` (send), `balloon:placement` e `balloon:shown` (eventos), `windows:balloon:close` (invoke).
- `clipboard:writeText`: o "Copiar" passa pelo main (`clipboard` do Electron 45 é assíncrono). **Descartado:** liberar a permissão web de área de transferência, que hoje fica negada para tudo.
- `windows:balloon:toggle` não existe: abrir/fechar vem de ações tratadas no main (clique, menus, bandeja, atalho).

### 2026-10-24 · Erros: o main manda o código, o balão escreve a frase
`ChatErrorInfo { code, retryAfterSeconds?, supportCode }`. O texto vem do i18n (`error.<CÓDIGO>`), com variante `.witty` só nos códigos que a SPEC §23 permite suavizar. O código de suporte (`CLP-XXXX`) aparece no balão e no log, junto com o detalhe técnico, que nunca vai para a tela.

### 2026-10-24 · Personalidades: prompts e falas no perfil; rótulos no i18n
`src/shared/personalities/` guarda as instruções (base do Apêndice A + camada de cada personalidade) e as falas do personagem (`greeting`, `modeActivated`, `wakeUp`, `demoFallback`). Nome, descrição e frase de exemplo continuam no i18n, porque são rótulos de interface usados também nos menus. Os perfis são validados com Zod no main e nos testes; o módulo não importa Zod para poder entrar no bundle do balão. Os prompts seguem em português, como no Apêndice A, para o dono do produto poder lê-los e ajustá-los.

### 2026-10-24 · Modo Demo
Repertório por tema (renomear, captura de tela, copiar e colar, horas, quem é você, o que sabe fazer, saudação), com passos por sistema (Windows/macOS/Linux), dois idiomas e final no tom de cada personalidade. O idioma vem das palavras da pergunta; empate fica com o da interface. Palavras inteiras (`oi` não casa com `foi`). "Que horas são?" é respondida com o relógio do sistema; na Fase 5 passa pelo `getCurrentTime` e pelo fluxo de ferramentas. Ritmo: 0,7 s "pensando" e um pedaço a cada 28 ms.

### 2026-10-24 · Simulações só em desenvolvimento e E2E
`/simular erro <status>`, `timeout`, `offline`, `queda` e `markdown` (resposta com `javascript:`, `<script>`, `onerror` e imagem remota, para provar o Markdown seguro de ponta a ponta). Ativas quando o app não está empacotado ou com `CLIPSTER_E2E=1`.

### 2026-10-24 · Histórico
Um arquivo (`history.json`) com várias conversas; ao abrir, a mais recente volta para o balão. Retenção ao carregar e ao mudar a opção; limite de ~5 MB removendo as mais antigas. Desligar para de gravar na hora; o arquivo só some se o usuário aceitar a pergunta "apagar também o que já foi salvo?". "Limpar histórico" apaga primeiro a conversa (uma resposta em andamento é interrompida e entregue ao histórico) e depois o disco, numa fila única de escrita: nenhuma gravação atrasada recria o arquivo.

### 2026-10-24 · Confirmações em linha, sem diálogo nativo
"Limpar histórico" e "apagar o que já foi salvo" usam uma caixa de confirmação dentro da própria janela, com o foco inicial em Cancelar (SPEC §22.2). Diálogos nativos bloqueariam os testes E2E e destoariam do resto da interface.

### 2026-10-24 · Dica "ainda estou aqui" só no Windows
Na primeira vez que o usuário esconde o Clipster, aparece uma dica junto ao ícone da bandeja (`tray.displayBalloon`). Só no Windows, onde o ícone pode ficar em "ícones ocultos". No macOS o ícone fica sempre visível na barra de menus; no Linux não há essa API. A marca `hideTipShown` fica nas configurações, gerenciada pelo main.

### 2026-10-24 · Atalho global fixo
"Atalho para chamar o Clipster" (desligado por padrão) registra `CommandOrControl+Shift+Space` antes de salvar; se outro programa já o usa, a configuração não muda e aparece "Esse atalho já está em uso" (código `SHORTCUT_IN_USE`). Escolher outra combinação fica para depois.

### 2026-10-24 · Corretor ortográfico segue desligado no balão
Ligá-lo no Windows e no Linux faria o Chromium baixar dicionários Hunspell (SPEC §26.14). Fica para quando houver dicionários empacotados ou o corretor nativo do sistema.

### 2026-10-24 · Configurações › IA só com "Nenhuma" e "Modo demonstração"
Os providers reais chegam na Fase 4. Se o arquivo tiver outro valor, o balão trata como "nenhuma IA configurada".

### 2026-10-24 · Visual do balão
O cabeçalho imita o visor do personagem (vidro escuro, brilho ciano, olhos de pixel), nos dois temas; o resto é "papel" discreto. As respostas do Clipster ficam sem bolha própria (o balão já é a fala dele); as mensagens do usuário aparecem como etiquetas à direita. Com os controles visíveis, o nome "Clipster" no cabeçalho fica só para leitores de tela, porque não cabe junto com o seletor de personalidade em 340 DIP.

### 2026-10-24 · E2E
`CLIPSTER_E2E_DEMO_DELAY_MS` controla o ritmo do Demo nos testes (padrão 0). Os testes podem gravar um `settings.json` inicial na pasta temporária (ex.: usuário que já passou pela primeira execução).

### 2026-10-24 · Versão 0.3.0
Balão de conversa, modo Demo, personalidades em ação, Markdown seguro, histórico opcional e primeira execução (Fase 3).
