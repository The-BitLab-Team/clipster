# Roteiro de QA manual (Windows)

Itens que os testes automáticos não conseguem verificar num desktop real (SPEC §29.4 e §36, itens 10–17). Rode antes de cada release, no Windows. Anote o resultado em [`compatibility.md`](compatibility.md).

**Preparação:** `npm install` e depois `npm run dev`, ou instale o pacote gerado por `npm run package:win`.

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

## Arrasto e posição

- [ ] Arrastar move o personagem suavemente, sem "pular".
- [ ] Não dá para colocá-lo atrás da barra de tarefas nem fora da tela.
- [ ] Fechar (Sair) e abrir de novo → ele volta para o mesmo lugar.
- [ ] **Dois monitores:** arrastar para o segundo monitor funciona; a posição é restaurada lá.
- [ ] **Monitores com escalas diferentes** (ex.: 100% e 150%): ao cruzar, o tamanho continua correto.
- [ ] Desconectar o segundo monitor com o Clipster nele → ele reaparece no principal.
- [ ] Mudar a resolução para uma menor → ele continua visível.

## Bandeja e menus

- [ ] O ícone aparece na bandeja (pode estar em "Mostrar ícones ocultos").
- [ ] Clique esquerdo no ícone mostra o Clipster.
- [ ] Clique direito mostra: Abrir, Personalidade, Sempre visível, Modo silencioso, Configurações…, Esconder/Mostrar, Sair.
- [ ] Clique direito no personagem mostra o menu de contexto, sem o menu de sistema da janela.
- [ ] Trocar a personalidade pela bandeja reflete nas Configurações (se abertas).
- [ ] "Sempre visível" desligado → o Clipster pode ficar atrás de outras janelas.
- [ ] Esconder → some; Abrir/Mostrar → volta.
- [ ] `Alt+F4` com o personagem focado **esconde**, não fecha o app.
- [ ] Sair → o processo termina (conferir no Gerenciador de Tarefas).

## Configurações

- [ ] Abre por "Configurações…" e recebe foco.
- [ ] Mudar o idioma para English traduz a janela, a bandeja e o menu de contexto na hora.
- [ ] Tema escuro e claro funcionam; "Seguir o sistema" acompanha o Windows.
- [ ] O tamanho do personagem muda ao arrastar o controle (75% a 150%).
- [ ] Navegação só com teclado (Tab, Espaço, setas) funciona, com foco visível.
- [ ] Alto contraste do Windows: tudo continua legível.

## Instalador (app empacotado)

- [ ] O instalador roda sem pedir administrador (aviso do SmartScreen esperado: "Mais informações" › "Executar assim mesmo").
- [ ] Atalhos no Menu Iniciar e na área de trabalho.
- [ ] "Iniciar com o sistema" fica habilitado; ligado → o Clipster abre ao entrar no Windows.
- [ ] "Iniciar escondido" + iniciar com o sistema → abre só na bandeja.
- [ ] Abrir o app duas vezes não cria dois Clipsters.
- [ ] Desinstalar remove o app (as configurações em `%APPDATA%\Clipster` permanecem, por design).

## Desempenho (Gerenciador de Tarefas, após 5 minutos parado)

- [ ] CPU do Clipster ≈ 0%.
- [ ] Memória total anotada em `compatibility.md` (meta ≤ 250 MB).
