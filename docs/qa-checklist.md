# Roteiro de QA manual (Windows)

Itens que os testes automáticos não conseguem verificar num desktop real (SPEC §29.4 e §36, itens 10–17). Rode antes de cada release, no Windows. Anote o resultado em [`compatibility.md`](compatibility.md).

**Preparação:** `npm ci`, depois `npm run dev` para os itens marcados "(dev)"; para o resto, gere e instale o pacote com `npm run package:win` (ou pelo workflow **Build artifacts** no GitHub).

## Critério de pronto (SPEC §36, itens 10–17)

O Clipster está pronto para entrega quando todos estes passam no Windows. Cada um aponta para as seções abaixo.

| # | Critério | Onde verificar |
|---|----------|----------------|
| 10 | Aparece no desktop, com transparência, sem bloquear cliques fora da silhueta | [Personagem](#personagem) |
| 11 | Arrasta; posição restaurada ao reabrir, inclusive após trocar de monitor ou resolução | [Arrasto e posição](#arrasto-e-posição) |
| 12 | Clique abre o balão; o Demo responde aos poucos; os estados mudam certo | [Balão de conversa](#balão-de-conversa-fase-3), [Estados](#estados-do-personagem-fase-2) |
| 13 | Prestativo/Espirituoso alternam e persistem | [Balão de conversa](#balão-de-conversa-fase-3) |
| 14 | Bandeja e menu de contexto funcionam | [Bandeja e menus](#bandeja-e-menus) |
| 15 | Configurações funcionam e persistem | [Configurações](#configurações) |
| 16 | Fechar/esconder ≠ sair; "Sair" encerra o processo | [Bandeja e menus](#bandeja-e-menus) |
| 17 | O instalador instala e desinstala corretamente | [Instalador](#instalador-app-empacotado) |

Antes do primeiro release público, também: [IA de verdade](#ia-de-verdade-fase-4) com um provider local e um na nuvem, [Acessibilidade](#acessibilidade) e [Desempenho](#desempenho).

## Personagem

- [ ] O Clipster aparece no canto inferior direito, **sem fundo** (só a silhueta) e sem sombra retangular.
- [ ] Ele aparece **sem tirar o foco** da janela em que você estava digitando.
- [ ] Não aparece na barra de tarefas.
- [ ] Clicar nas áreas transparentes ao redor dele atinge a janela de baixo (clique através).
- [ ] O cursor vira "mão" só sobre a silhueta.
- [ ] Clicar nele dá uma pequena balançada (com animações ligadas).
- [ ] Ele pisca de vez em quando; com Configurações › Aparência › Animações = "Desligadas", não pisca.
- [ ] Com "Reduzir movimento" do Windows ligado e Animações = "Seguir o sistema", não há balanço.

## Estados do personagem (Fase 2)

Em `npm run dev`, use o clique direito › **Pré-visualizar estado (dev)** para ver cada estado (dura 4 s).

- [ ] Os 10 estados aparecem e são distinguíveis: à disposição, ouvindo, pensando (reticências), falando (boca mexendo), contente (brilhos), confuso ("?"), dormindo ("z"), problema (olhos em X, visor vermelho), aviso ("!", visor âmbar), sendo arrastado.
- [ ] Os acessórios ("…", "z", "?", "!", brilhos) aparecem bem tanto num papel de parede **escuro** quanto num **claro**.
- [ ] As transições entre poses são suaves (com animações ligadas) e instantâneas com Animações = "Reduzidas" ou "Desligadas".
- [ ] Primeira execução (apague `%APPDATA%\Clipster (dev)` antes): começa contente e volta ao normal.
- [ ] Trocar a personalidade (bandeja ou Configurações) → contente por um instante.
- [ ] Durante o arrasto → pose "sendo arrastado"; ao soltar, volta ao normal.
- [ ] Configurações › Geral › "Dormir depois de" = 5 minutos → depois de 5 min sem mexer no Clipster, ele dorme.
- [ ] Clicar nele dormindo → fica confuso e depois volta ao normal.
- [ ] Dormindo, os "z" sobem algumas vezes e param (sem animação eterna). Gerenciador de Tarefas: CPU ≈ 0%.
- [ ] Com o leitor de tela (Narrador), o personagem é anunciado com o estado ("Clipster (dormindo)…").
- [ ] No app instalado, o submenu "Pré-visualizar estado (dev)" **não** aparece.

## Balão de conversa (Fase 3)

**Primeira execução** (apague `%APPDATA%\Clipster (dev)` antes, ou use o app instalado pela primeira vez):

- [ ] Cerca de 1 s depois de o personagem aparecer, o balão de boas-vindas surge **sem tirar o foco** da janela em que você estava digitando.
- [ ] Trocar o idioma no passo 1 traduz o balão na hora.
- [ ] Passo 2: escolher Espirituoso destaca a opção; Passo 3: "Experimentar no modo demonstração" mostra o campo de texto e o selo **Demo**.
- [ ] `Esc` no onboarding pula tudo; reabrindo o app, o onboarding não volta.

**Conversa:**

- [ ] Clicar no personagem abre o balão acima e à esquerda dele, com o rabicho apontando para o personagem, e o cursor já no campo de texto.
- [ ] Clicar de novo fecha. O balão não fecha sozinho quando você clica em outro programa.
- [ ] Arrastar o personagem com o balão aberto: o balão acompanha.
- [ ] Personagem no canto superior esquerdo: o balão abre para baixo e para a direita, sem sair da tela.
- [ ] Monitor secundário e escalas diferentes (100%/150%): o balão aparece no mesmo monitor do personagem, com o tamanho certo.
- [ ] "Como eu renomeio um arquivo?" → personagem pensando → falando (resposta aparece aos poucos) → à disposição. A resposta fala do **Explorador de Arquivos** e da tecla **F2**.
- [ ] Trocar para **Espirituoso** no balão → aparece "Modo Espirituoso ativado", o personagem fica contente; "Como faço uma captura de tela?" responde com **Windows + Shift + S** e uma observação leve.
- [ ] Durante uma resposta: **Parar** (ou `Esc`) interrompe; a resposta fica marcada "(interrompida)".
- [ ] `Shift+Enter` quebra a linha; `Enter` envia.
- [ ] **Copiar** (ícone abaixo da resposta) e "Copiar código" colam certo no Bloco de Notas.
- [ ] "Nova conversa" (ícone de lápis) limpa o balão.
- [ ] Fechar o balão no meio de uma resposta e reabrir: a resposta terminou em segundo plano.
- [ ] Configurações › IA = "Nenhuma": o balão mostra "Nenhuma IA configurada" com os dois botões.
- [ ] Configurações › Aparência › "Tamanho do balão de conversa" 85% e 130%: tudo continua legível e cabe na tela.
- [ ] Configurações › Geral › "Atalho para chamar o Clipster" ligado: `Ctrl+Shift+Espaço` abre e fecha o balão de qualquer programa.
- [ ] Esconder o Clipster pela primeira vez: aparece a dica "Ainda estou aqui" junto ao relógio. Na segunda vez, não aparece.
- [ ] Narrador: ao enviar, anuncia "Clipster está respondendo"; ao terminar, lê a resposta inteira uma vez (não palavra por palavra).
- [ ] Alto contraste do Windows: o balão continua legível, com bordas visíveis.
- [ ] Tema escuro e claro: o cabeçalho (visor) é escuro nos dois; o resto acompanha o tema.

**Histórico:**

- [ ] Configurações › Privacidade › "Salvar histórico" ligado → converse, saia e abra de novo: a conversa volta.
- [ ] "Limpar histórico" pede confirmação, com o foco em **Cancelar**; confirmar apaga a conversa do balão também.
- [ ] Desligar "Salvar histórico" pergunta se apaga o que já foi salvo.

## IA de verdade (Fase 4)

Estes itens só podem ser feitos com os serviços reais: os testes automáticos usam servidores simulados.

**Ollama (local):**

- [ ] Instale o Ollama e rode `ollama pull llama3.2` (ou outro modelo pequeno).
- [ ] Configurações › IA › "Servidor compatível com OpenAI" › atalho **Ollama**: a lista de modelos mostra os modelos baixados.
- [ ] **Testar conexão** → "Conectado. Modelos disponíveis: N."
- [ ] No balão, sem o selo Demo: "Como eu renomeio um arquivo?" → personagem pensando → falando → resposta em português, aparecendo aos poucos.
- [ ] Primeira pergunta depois de abrir o Ollama (modelo frio): demora, mas não dá "A resposta demorou demais" antes de ~90 s.
- [ ] **Parar** no meio interrompe a resposta (e a GPU/CPU do Ollama para de trabalhar logo depois).
- [ ] Feche o Ollama e pergunte de novo → "Não consegui me conectar…" com **Tentar de novo**; abra o Ollama e clique em Tentar de novo → funciona.
- [ ] Endereço `http://localhost:11434` (sem `/v1`) → Testar conexão explica que o endereço deve terminar em `/v1`.

**LM Studio (local):** ligue o servidor (aba Developer), carregue um modelo, use o atalho **LM Studio** e repita: lista de modelos, testar conexão, uma pergunta.

**Claude (nuvem):**

- [ ] Configurações › IA › **Claude**: o balão mostra "Falta a chave de API" até salvar a chave.
- [ ] Cole a chave e **Salvar chave** → aparece "Chave salva: •••• " e os 4 últimos caracteres; o campo esvazia.
- [ ] Abra `%APPDATA%\Clipster\secrets.json` no Bloco de Notas: a chave **não** aparece em texto puro. `settings.json` não tem a chave.
- [ ] A lista de modelos vem da Anthropic (nomes como no Console). Escolha um → Testar conexão → "Conectado".
- [ ] Uma pergunta em **Prestativo** e outra em **Espirituoso**: o tom muda.
- [ ] Chave errada (salve uma chave inválida) → "A chave de API foi recusada…" com **Abrir Configurações**.
- [ ] Modelo inexistente (na lista, "Outro (digitar o nome)" com um nome qualquer) → "O modelo escolhido não está disponível" com **Escolher modelo**.
- [ ] Sem crédito na conta (se for possível testar) → "O limite de uso ou de cobrança…" com **Abrir o painel da conta**, que abre o Console no navegador.
- [ ] **Remover chave** → o balão volta a mostrar "Falta a chave de API".
- [ ] Abra `logs\clipster.log`: nenhuma chave nem texto de conversa.

**OpenAI (nuvem):** atalho **OpenAI**, salve a chave, escolha um modelo da lista (ex.: um modelo de raciocínio e um comum) e faça uma pergunta com cada um. Troque o endereço para o Ollama: a tela avisa que a chave salva é de outro endereço (e o Ollama não recebe a chave).

**Interface:**

- [ ] Configurações › IA navegável só pelo teclado, com foco visível; leitor de tela anuncia o resultado de "Testar conexão".
- [ ] 125% e 150% de escala: os campos de endereço e chave cabem sem cortar texto.

## Ferramentas e permissões (Fase 5)

**Com qualquer IA (Demo serve):**

- [ ] "Que horas são?" → acima da resposta aparece "✓ Consultou o relógio" e a hora está certa (fuso do Windows).
- [ ] "Qual a sua versão?" → "✓ Consultou a versão do Clipster" e a versão bate com Configurações › Sobre.

**Com IA de verdade (Ollama com um modelo que use ferramentas, como `llama3.2` ou `qwen2.5`; Claude; OpenAI):**

- [ ] "Que horas são agora?" → o modelo usa a ferramenta (aparece o selo) e responde com a hora certa.
- [ ] Um modelo do Ollama sem suporte a ferramentas (um que não tenha a etiqueta "tools" na biblioteca do Ollama) continua respondendo normalmente, sem erro.

**Pedido de permissão** (em desenvolvimento, no PowerShell: `$env:CLIPSTER_DEV_TOOLS=1; npm run dev`, depois o Demo):

- [ ] `/simular ferramenta apagar relatorio.docx` → o personagem mostra o "!"; o balão mostra o pedido com o nome do arquivo, "Não dá para desfazer", só **Cancelar** e **Permitir uma vez**, e o foco em Cancelar. Nada roubou o foco de outro programa.
- [ ] Fechar o balão com o pedido aberto e clicar no personagem: o pedido continua lá.
- [ ] Cancelar → "não permitido" e "Tudo bem, não fiz nada."; Permitir uma vez → segue (nada é apagado de verdade).
- [ ] `/simular ferramenta ler Fotos` → aparecem também **Nesta sessão** e **Sempre**. "Sempre" → da próxima vez não pergunta; aparece em Configurações › Privacidade › Permissões; Revogar → volta a perguntar.
- [ ] `Esc` com o pedido aberto recusa; **Parar** cancela; sem resposta por 2 minutos, cancela sozinho.
- [ ] Narrador: o pedido é anunciado ao aparecer; Tab percorre os botões.
- [ ] No app instalado, `/simular ferramenta …` não pede nada (as ferramentas de teste não existem).

## Arrasto e posição

- [ ] Arrastar move o personagem suavemente, sem "pular".
- [ ] Não dá para colocá-lo atrás da barra de tarefas nem fora da tela.
- [ ] Fechar (Sair) e abrir de novo → ele volta para o mesmo lugar.
- [ ] **Dois monitores:** arrastar para o segundo monitor funciona; a posição é restaurada lá. O balão abre no mesmo monitor do personagem.
- [ ] **Segundo monitor à esquerda ou acima do principal** (coordenadas negativas): arrastar e restaurar funcionam.
- [ ] **Monitores com escalas diferentes** (ex.: 100% e 150%): ao cruzar, o tamanho continua correto e o balão acompanha.
- [ ] Desconectar o segundo monitor com o Clipster nele → ele reaparece no principal.
- [ ] Mudar a resolução para uma menor → ele continua visível.

## Bandeja e menus

- [ ] O ícone aparece na bandeja (pode estar em "Mostrar ícones ocultos").
- [ ] Clique esquerdo no ícone mostra o Clipster (e abre o balão).
- [ ] Clique direito mostra: Abrir, Personalidade, Sempre visível, Modo silencioso, Configurações…, Esconder/Mostrar, Sair.
- [ ] Clique esquerdo no ícone abre e fecha o balão de conversa.
- [ ] Clique direito no personagem mostra o menu de contexto, sem o menu de sistema da janela.
- [ ] Trocar a personalidade pela bandeja reflete nas Configurações (se abertas).
- [ ] "Sempre visível" desligado → o Clipster pode ficar atrás de outras janelas.
- [ ] Esconder → some; Abrir/Mostrar → volta.
- [ ] `Alt+F4` com o personagem focado **esconde**, não fecha o app.
- [ ] Sair → o processo termina (conferir no Gerenciador de Tarefas).

## Configurações

- [ ] Abre por "Configurações…" e recebe foco.
- [ ] Sobre › **Copiar diagnóstico** → cole no Bloco de Notas: versões, Windows, telas e IA escolhida; nenhuma chave, endereço de servidor ou conversa.
- [ ] Mudar o idioma para English traduz a janela, a bandeja e o menu de contexto na hora.
- [ ] Tema escuro e claro funcionam; "Seguir o sistema" acompanha o Windows.
- [ ] O tamanho do personagem muda ao arrastar o controle (75% a 150%).
- [ ] Navegação só com teclado (Tab, Espaço, setas) funciona, com foco visível.
- [ ] Alto contraste do Windows: tudo continua legível.

## Instalador (app empacotado)

- [ ] O instalador (`clipster-<versão>-setup.exe`) roda sem pedir administrador (aviso do SmartScreen esperado: "Mais informações" › "Executar assim mesmo").
- [ ] Instala em `%LOCALAPPDATA%\Programs\clipster` e abre o Clipster ao terminar.
- [ ] Atalhos no Menu Iniciar e na área de trabalho, com o ícone do Clipster.
- [ ] Gerenciador de Tarefas e Configurações do Windows › Aplicativos mostram "Clipster" com o ícone certo.
- [ ] "Iniciar com o sistema" fica habilitado; ligado → o Clipster abre ao entrar no Windows (e aparece em Gerenciador de Tarefas › Aplicativos de inicialização).
- [ ] "Iniciar escondido" + iniciar com o sistema → abre só na bandeja.
- [ ] Abrir o app duas vezes não cria dois Clipsters.
- [ ] Instalar uma versão nova por cima: configurações, posição e "Iniciar com o sistema" continuam.
- [ ] Desinstalar (Configurações do Windows › Aplicativos): o app e os atalhos somem; a entrada de inicialização também; as configurações em `%APPDATA%\Clipster` permanecem, por design.

## Acessibilidade

Os testes automáticos já passam o axe-core (WCAG 2.2 AA) em todas as telas e conferem o foco visível pelo teclado. Falta o que só um desktop de verdade mostra:

- [ ] **Narrador** (`Ctrl+Win+Enter`): o personagem é anunciado com o estado; ao enviar uma pergunta, "Clipster está respondendo"; ao terminar, a resposta inteira uma vez; um pedido de permissão é anunciado ao aparecer.
- [ ] **Só teclado:** atalho global abre o balão; Tab percorre cabeçalho, mensagens e campo; setas trocam a personalidade; `Esc` para/fecha. Nas Configurações, tudo alcançável com Tab, Espaço e setas.
- [ ] **Alto contraste** (Configurações do Windows › Acessibilidade › Temas de contraste): balão, cartões de erro e de permissão, chips das ferramentas e Configurações com bordas e textos visíveis; a personalidade escolhida destacada.
- [ ] **Texto maior** (Acessibilidade › Tamanho do texto 150%) e escala de tela 150%/175%: nada cortado no balão nem nas Configurações.

## Desempenho

- [ ] No projeto, rode `npm run measure` (uns 2 minutos; usa uma pasta de dados temporária). Ele mostra o tempo até o personagem aparecer e a CPU e a memória privada parado e dormindo. Cole a tabela em `compatibility.md` › Medições.
- [ ] Metas (SPEC §25): personagem em menos de 2 s; CPU parado abaixo de 0,5%; memória até 250 MB.
- [ ] Com o app instalado, após 5 minutos parado, o Gerenciador de Tarefas mostra CPU ≈ 0% para o Clipster.
