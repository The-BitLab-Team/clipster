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

### 2026-10-24 · `@types/hast` declarado explicitamente
`Markdown.tsx` importa tipos de `hast`, que antes só chegavam como dependência transitiva de `react-markdown`. Declarar `@types/hast` em `devDependencies` evita quebra se a árvore de dependências mudar. Alternativa descartada: tipar os nós localmente (duplicaria tipos mantidos pela comunidade).

---

## Fase 4 — IA real

### 2026-10-24 · Anthropic pelo SDK oficial; compatível com OpenAI com `fetch` próprio
`@anthropic-ai/sdk` 1.3 (dependência só do main) traz as classes de erro tipadas, o `request-id` e o streaming da Messages API, como a SPEC §20.4 pede. Configurado com `apiKey` e `baseURL` explícitos (o SDK não procura variáveis de ambiente nem perfis) e `maxRetries: 1`. Para o compatível com OpenAI, `fetch` do Node + um leitor de SSE de ~40 linhas: os servidores locais variam muito, e o SDK da OpenAI seria mais uma dependência grande só para um endpoint. **Descartado:** SDK da OpenAI; Vercel AI SDK (camada a mais entre o Clipster e os erros de cada provider).

### 2026-10-24 · Anthropic: sem parâmetros de amostragem
Na API atual (versão `2026-10-21`, SDK 1.x), `temperature`, `top_p` e `top_k` são recusados com erro 400. A preferência de temperatura de cada personalidade continua no perfil e vale para os servidores compatíveis com OpenAI; no Claude, o tom vem só das instruções. Modelos com `lifecycle: retired` saem da lista; os `deprecated` aparecem com "(vai ser desativado)".

### 2026-10-24 · OpenAI: Chat Completions, com ajustes para api.openai.com
O mesmo provider atende Ollama, LM Studio e a OpenAI. Em `api.openai.com`: `max_completion_tokens` no lugar de `max_tokens` e sem `temperature` (os modelos de raciocínio recusam os dois). Se outro servidor recusar `temperature` ou `max_tokens` com 400, o pedido é refeito uma vez sem o parâmetro. Os campos `reasoning`/`reasoning_content` (Ollama, LM Studio, DeepSeek) viram o evento `thinking`. **Adiado:** adaptador da Responses API, que a OpenAI recomenda para projetos novos; Chat Completions continua suportada e é o que os servidores locais implementam.

### 2026-10-24 · Evento `thinking` e tempos-limite de servidor local
Modelos que "pensam" mandam raciocínio antes do texto. `thinking` zera o cronômetro do primeiro token (há atividade), mas o personagem só passa a "falando" com texto de verdade, e o raciocínio não aparece no balão. Servidores locais (`localhost`, `127.x`, `::1`) têm 90 s até o primeiro token e 5 min no total, porque a primeira pergunta carrega o modelo na memória; nuvem segue 30 s e 2 min (SPEC §20.5). `CLIPSTER_E2E_AI_TIMEOUTS` encurta os dois nos testes.

### 2026-10-24 · Chaves: `secrets.json`, chave presa à origem, confirmação sem cofre
Cada chave fica cifrada com `safeStorage` em `secrets.json`, com os últimos 4 caracteres à parte para a dica. A chave do compatível com OpenAI guarda a origem (`https://api.openai.com`) em que foi salva e só é enviada para ela: trocar o endereço não vaza a chave para outro servidor (a tela avisa que a chave salva é de outro endereço). Sem cofre de verdade (`basic_text` no Linux, ou criptografia indisponível), salvar exige `allowInsecure: true`, que só a caixa "Entendo o risco" envia; sem ela, o main responde `INSECURE_STORAGE`. Chaves com espaço, menores que 8 ou maiores que 512 caracteres são recusadas.

### 2026-10-24 · `.env` só em desenvolvimento
`ANTHROPIC_API_KEY` e `OPENAI_API_KEY` são lidos de `.env` na raiz quando o app não está empacotado e não está em E2E. Servem de reserva: uma chave salva pela tela vale mais. `OPENAI_API_KEY` só vale para `https://api.openai.com`. Leitor próprio de 20 linhas. **Descartado:** `dotenv` (dependência para algo trivial).

### 2026-10-24 · Configurações v2
`ai.baseUrl`/`ai.model` viram `ai.openaiCompatible.{baseUrl, model}`, e `ai.anthropic.model` é novo: trocar de provider não apaga o modelo do outro. Migração v1 → v2 em `settingsRecovery.ts`; arquivo sem versão mas já no formato novo mantém as seções que tiver.

### 2026-10-24 · Prontidão da IA (`ai:status`)
O main calcula se dá para conversar (`noProvider`, `missingModel`, `missingKey`) e avisa o balão e as Configurações quando isso muda. O balão mostra o aviso certo ("Falta a chave de API", "Falta escolher o modelo") no lugar do campo de texto. Chave obrigatória: Claude sempre; compatível com OpenAI só em `api.openai.com` (servidores locais e outros endereços podem não exigir).

### 2026-10-24 · Canais novos
`secrets:set` (com `allowInsecure` opcional), `secrets:clear`, `secrets:status`, `ai:models:list`, `ai:connection:test` (só a janela de Configurações) e `ai:status:get` + evento `ai:status` (balão e Configurações). Listar modelos e testar conexão têm 15 s de limite; o detalhe técnico vai só para o log. "Testar conexão" de um endereço que responde mas não fala o protocolo (404 em `/models`) mostra "confira se o endereço termina em /v1".

### 2026-10-24 · Pergunta que falhou sai do contexto
O protocolo exige papéis alternados; uma pergunta sem resposta seria grudada na seguinte e o mesmo erro voltaria (contexto longo demais, por exemplo). "Tentar de novo" reenvia a pergunta explicitamente. Bug encontrado pelos testes E2E com o servidor simulado.

### 2026-10-24 · Erro de cota: painel da conta
`QUOTA_OR_BILLING` oferece "Abrir o painel da conta" (SPEC §23) quando o provider é Claude (`https://platform.claude.com/`) ou a OpenAI (`https://platform.openai.com/`), e sempre "Abrir Configurações". Só a página inicial do painel: os caminhos internos mudam mais. O endereço vem do main e o esquema só aceita esses dois.

### 2026-10-24 · Testes com servidores simulados
`tests/support/mockProviders.ts` sobe servidores HTTP locais que seguem os protocolos (SSE da OpenAI; eventos, erros, `retry-after` e `request-id` da Anthropic) e respondem a marcadores (`[401]`, `[429]`, `[stall]`, `[think]`…). Os testes de unidade e E2E usam os providers de verdade contra eles. `CLIPSTER_E2E_ANTHROPIC_BASE_URL` aponta o Claude para o simulado, só em E2E. A conversa com os serviços reais fica no roteiro manual: este ambiente não tem acesso a eles.

### 2026-10-24 · Versão 0.4.0
IA real: servidores compatíveis com OpenAI (Ollama, LM Studio, OpenAI) e Claude, chaves no cofre do sistema, lista de modelos, testar conexão e erros da SPEC §23 (Fase 4).

---

## Fase 5 — ferramentas

### 2026-10-25 · Laço de ferramentas no AssistantService
O provider devolve `tool-call`; o AssistantService executa cada chamada (pelo `ToolExecutor`) e pede a continuação com `toolRounds` (texto da rodada, chamadas, resultados e uma `continuation` opaca do provider), até o modelo responder só com texto. Tudo numa resposta só: o balão mostra as ferramentas usadas acima do texto. **Descartado:** mensagens com papel `tool` na conversa (o "'tool' entra na Fase 5" do §20.1): cada provider tem um formato próprio para isso, e a conversa guardada (e o histórico) só precisa do texto e de quais ferramentas foram usadas. Para as perguntas seguintes, o modelo recebe só o texto das respostas anteriores.

### 2026-10-25 · Limite de 5 chamadas e tempos-limite
A partir da 6ª chamada, a ferramenta é recusada sem executar e a rodada seguinte vai sem ferramentas, forçando uma resposta em texto. O tempo da IA (primeiro pedaço e total) para enquanto as ferramentas rodam ou esperam o usuário; cada ferramenta tem 10 s para terminar; o pedido de permissão vence em 2 min (sem resposta = cancelar, SPEC §22.2). Cada rodada tem o seu prazo para o primeiro pedaço.

### 2026-10-25 · Permissão por ferramenta, não por capacidade
Uma concessão vale para a ferramenta e as permissões em que foi dada (`{ tool, permissions }`). Permitir "ler arquivos" para uma ferramenta não libera outra que também lê arquivos, e uma ferramenta que passe a pedir uma permissão nova pergunta de novo. "Sempre" vai para `settings.json` (`permissions.grants`, só o main altera; `settings:update` recusa); "nesta sessão", só na memória. Ao ler, o risco manda: concessões guardadas nunca valem para ação destrutiva, e "sempre" nunca vale para escrita, mesmo que alguém edite o arquivo.

### 2026-10-25 · Pedido de permissão dentro do balão, pelo `chat:event`
O pedido vai como atividade da ferramenta (`status: 'awaiting'` + `prompt`) no evento `chat:event` `tool` e no snapshot da conversa, então reabrir ou recarregar o balão mostra o pedido pendente. Substitui o evento `permissions:request` do Apêndice C. A resposta vem por `permissions:respond` (só o balão); o main confere se o pedido existe e se a escolha é permitida para o risco. Foco inicial em Cancelar em todos os pedidos (a SPEC exige nas destrutivas; nas outras, evita aprovar com um Enter distraído). `Esc` recusa. **Descartado:** diálogo nativo (bloquearia os testes e roubaria o foco).

### 2026-10-25 · O personagem avisa enquanto espera
Eventos `PERMISSION_REQUESTED` e `PERMISSION_RESOLVED` na máquina de estados: pensando/falando → `notification` (o "!") até a resposta; clique, digitação, arrasto e o timer transitório não tiram o aviso; Parar, erro ou fim da resposta, sim. O balão não abre sozinho (SPEC §2): o usuário clica no personagem e vê o pedido.

### 2026-10-25 · Textos: descrição para a IA em `personalities/`, pedido no i18n
`description` (SPEC §22.1) fica em `src/shared/personalities/tools.ts`, junto dos outros prompts, assim como as notas curtas que acompanham resultados com erro. `describeAction` monta o `LocalizedString` com o i18n (`tool.<nome>.action`), nos dois idiomas. Argumentos que aparecem no pedido não aceitam caracteres de controle nem de direção de texto (um nome de arquivo não pode se disfarçar).

### 2026-10-25 · Ferramentas de teste
`demoDestructiveAction` (SPEC §22.3) e `demoReadAction` (nova: leitura fictícia, para testar "nesta sessão", "sempre" e Revogar, já que as ferramentas reais do MVP não pedem permissão). Só com `CLIPSTER_DEV_TOOLS=1` e fora do app instalado (ou em E2E). Nenhuma toca em disco. O Demo as chama com `/simular ferramenta apagar|ler|loop`.

### 2026-10-25 · Ferramentas nos providers
- **Claude:** `tools` com `input_schema` (JSON Schema gerado do Zod), blocos `tool_use` montados a partir de `input_json_delta`; na continuação, o conteúdo do assistente volta como veio (blocos de raciocínio com assinatura incluídos, exigência da API quando há ferramentas) e os resultados vão como `tool_result`.
- **Compatível com OpenAI:** `tools` no formato `function`, `delta.tool_calls` em pedaços, continuação com `tool_calls` + mensagens `tool`. Modelo local sem suporte a ferramentas (Ollama responde 400 "does not support tools") → nova tentativa sem elas.
- **Demo:** "que horas são?" e "qual a sua versão?" passam pelas ferramentas (SPEC §20.3).

### 2026-10-25 · Auditoria no log
`tool.audit` com requisição, ferramenta, decisão (`not_required`, `already_granted`, `granted_once/session/always`, `denied`, `timeout`, `cancelled`, `unknown_tool`, `invalid_input`, `limit_reached`), sucesso e duração. Nunca os argumentos nem o resultado. **Descartado por ora:** tela de auditoria nas Configurações (o log basta para o MVP).

### 2026-10-25 · Versão 0.5.0
Ferramentas e permissões (Fase 5).

---

## Fase 6 — polimento e entrega

### 2026-10-25 · Acessibilidade verificada com o axe-core
`axe-core` 4.14 (devDependency) roda dentro de cada página nos testes E2E: personagem, balão em seis estados e as seis seções das Configurações, nos temas claro e escuro, com as regras WCAG 2.0/2.1/2.2 A e AA e as boas práticas. **Descartado:** `@axe-core/playwright`, que abre uma aba nova para terminar a análise, o que o Electron não permite. Correções que saíram da auditoria: o balão e a janela do personagem ganharam o landmark `main` (e a do personagem, um título oculto); o campo de texto ganhou um anel de foco de 2 px na caixa (antes, só a borda mudava de cor); no alto contraste, a personalidade escolhida usa `Highlight`/`HighlightText` sem ajuste forçado (o texto sumia). Os textos sobre o visor (degradê, que o axe não mede) foram conferidos à mão: contraste de 8,3:1 a 16:1.

### 2026-10-25 · `npm run measure`
Mede com `app.getAppMetrics()` o tempo até o personagem aparecer e a CPU e a memória parado e dormindo, numa pasta de dados temporária. A memória comparada com a meta é a privada no Windows (a coluna do Gerenciador de Tarefas) e o PSS no Linux; o "working set" somado conta várias vezes as bibliotecas compartilhadas e aparece só como referência. Mede o build de `out/`: o app instalado recusa automação (Fuses), como deve.

### 2026-10-25 · Vários monitores de verdade no Linux: Xorg com o driver "dummy"
O Xvfb não aceita monitores virtuais (`xrandr --setmonitor` é ignorado) nem o Xinerama aparece para o Electron. O Xorg com `xserver-xorg-video-dummy` tem 16 saídas virtuais que o `xrandr` liga e desliga, e o Electron vê dois monitores e recebe `display-removed` de verdade. Detalhe: esse driver só atualiza a lista de monitores quando alguém a consulta, então o script chama `xrandr --listmonitors` depois de cada mudança. Escala por `--force-device-scale-factor=1.5` (no X11, uma escala para todas as telas; escalas diferentes por monitor ficam no roteiro manual). Fica fora do CI: exige permissão para iniciar o Xorg.

### 2026-10-25 · Copiar diagnóstico e Verificar atualizações (SPEC §12, §24, §27.4)
"Copiar diagnóstico" monta no main um resumo técnico (versões, sistema, telas, idioma, IA escolhida e se está pronta, cofre seguro, preferências gerais, quantas permissões) e põe na área de transferência. Fica de fora: chaves (nem a dica), conversas, o endereço do servidor de IA (só "local" ou "remoto"), caminhos e nome de usuário. "Verificar atualizações" abre `<repositório>/releases` e só aparece com `REPOSITORY_URL` definido (decisão D6).

### 2026-10-25 · Desinstalação remove "Iniciar com o sistema"
`build/installer.nsh` apaga a entrada de inicialização do Windows (nome = AppUserModelID) ao desinstalar, mas não numa atualização. As configurações em `%APPDATA%\Clipster` continuam após desinstalar (`deleteAppDataOnUninstall: false`), para uma reinstalação não perder nada.

### 2026-10-25 · Memória acima da meta no ambiente de teste
Em Linux sem placa de vídeo (renderização por software), cerca de 290 MB de PSS com o personagem e o balão pré-criado, acima dos 250 MB da SPEC §25. Seguindo "medir antes de otimizar", nada foi cortado às cegas: o balão pré-criado é exigência da SPEC (abre na hora) e o processo de GPU por software pesa mais que no Windows. A medição no Windows (`npm run measure`) decide se há algo a fazer.

### 2026-10-26 · Memória no Windows dentro da meta
No Windows x64, `npm run measure` deu 241 MB de memória privada (5 processos), CPU de 0,07% à disposição e 0,01% dormindo e o personagem em menos de 2 s: as três metas da SPEC §25 atendidas. Os ~290 MB do Linux vinham da renderização por software. Nenhuma otimização de memória é necessária para o MVP.

### 2026-10-25 · Versão 0.6.0
Acessibilidade verificada, medição de desempenho, vários monitores e escala testados, instalador revisado, diagnóstico e documentação completa (Fase 6). O primeiro release público ainda depende do roteiro de QA no Windows e das decisões D1–D7.
