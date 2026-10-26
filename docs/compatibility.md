# Compatibilidade

Legenda: **Testado** = verificado de fato · **Deve funcionar** = implementado, mas não verificado nessa plataforma · **Não testado** = sem verificação nem expectativa firme · **N/A** = não se aplica.

Atualizado em 26/10/2026 (versão 0.6.0). Os testes automáticos rodaram num **Linux sem desktop (Xvfb)** dentro de um contêiner: lá não há compositor (transparência real) nem bandeja. No Windows, o dono do produto rodou a medição de desempenho (`npm run measure`, abaixo). O roteiro para o Windows está em [`qa-checklist.md`](qa-checklist.md).

## Por recurso

| Recurso | Windows 10/11 | macOS | Linux X11 | Linux Wayland |
|---------|---------------|-------|-----------|---------------|
| App inicia, personagem aparece | **Testado** (`npm run measure`, build de `out/`) | Deve funcionar | **Testado** (Xvfb, E2E) | Não testado |
| Transparência real | Deve funcionar | Deve funcionar | Deve funcionar (exige compositor) | Não testado |
| Não rouba foco (`showInactive`) | Deve funcionar | Deve funcionar | Deve funcionar | Não testado |
| Fora da barra de tarefas | Deve funcionar | N/A (Dock) | Deve funcionar | Não testado |
| Clique através das áreas transparentes | Deve funcionar | Deve funcionar | N/A (sem `forward`) | N/A |
| Arrasto | Deve funcionar | Deve funcionar | **Testado** (E2E, eventos sintéticos) | Não funciona nativamente* |
| Posição restaurada ao reabrir | Deve funcionar | Deve funcionar | **Testado** (E2E) | Não funciona nativamente* |
| Vários monitores: arrastar, restaurar, balão no mesmo monitor, monitor removido | Deve funcionar (lógica testada em unidade) | Deve funcionar | **Testado** (E2E com Xorg "dummy" e duas saídas) | Não testado |
| Escala 150% (DPI) | Deve funcionar | Deve funcionar | **Testado** (E2E com `--force-device-scale-factor=1.5`) | Não testado |
| Escalas diferentes por monitor; monitor à esquerda/acima (coordenadas negativas) | Deve funcionar (lógica testada em unidade) | Deve funcionar | N/A (X11 usa uma escala só e não tem coordenadas negativas) | Não testado |
| Bandeja | Deve funcionar | Deve funcionar | Deve funcionar (AppIndicator) | Não testado |
| Menu de contexto | Deve funcionar | Deve funcionar | Deve funcionar | Não testado |
| Configurações (abrir, alterar, persistir) | Deve funcionar | Deve funcionar | **Testado** (E2E) | Não testado |
| Comandos da bandeja (personalidade, esconder, mostrar) | Deve funcionar | Deve funcionar | **Testado** (E2E, via ganchos) | Não testado |
| Sair encerra o processo | Deve funcionar | Deve funcionar | **Testado** (E2E) | Não testado |
| Estados do personagem (10 poses) | Deve funcionar | Deve funcionar | **Testado** (E2E + capturas de cada pose) | Não testado |
| Sono por inatividade e acordar confuso | Deve funcionar | Deve funcionar | **Testado** (E2E com tempo curto) | Não testado |
| Animações finitas em repouso; nenhuma com "Desligadas" | Deve funcionar | Deve funcionar | **Testado** (E2E com `document.getAnimations()`) | Não testado |
| Balão: abre, fecha, segue o personagem, inverte perto das bordas | Deve funcionar | Deve funcionar | **Testado** (E2E + posição em unidade) | Não testado |
| Primeira execução: balão de boas-vindas sem tirar o foco | Deve funcionar | Deve funcionar | **Testado** (E2E: nenhuma janela focada) | Não testado |
| Conversa no modo Demo: streaming, Parar, erros simulados, nova conversa | Deve funcionar | Deve funcionar | **Testado** (E2E, cenário da §37) | Não testado |
| Markdown seguro (sem HTML, sem imagens, links validados) | Deve funcionar | Deve funcionar | **Testado** (E2E com `/simular markdown`) | Não testado |
| Copiar para a área de transferência | Deve funcionar | Deve funcionar | **Testado** (E2E, X11) | Não testado |
| Histórico opcional (restaurar, limpar, desligar) | Deve funcionar | Deve funcionar | **Testado** (E2E) | Não testado |
| Atalho global | Deve funcionar | Deve funcionar | Deve funcionar (não testado no E2E) | Não funciona* |
| Dica ao esconder (junto ao ícone da bandeja) | Deve funcionar | N/A | N/A | N/A |
| Leitor de tela anuncia a resposta | Deve funcionar (Narrador) | Deve funcionar (VoiceOver) | Não testado | Não testado |
| Acessibilidade automática (axe-core, WCAG 2.2 AA + boas práticas, temas claro e escuro) | Deve funcionar | Deve funcionar | **Testado** (E2E: 0 violações) | Não testado |
| Uso só pelo teclado, foco visível | Deve funcionar | Deve funcionar | **Testado** (E2E) | Não testado |
| Alto contraste (`forced-colors`) | Deve funcionar | N/A | Conferido em capturas com a emulação do Chromium | — |
| IA local compatível com OpenAI (Ollama, LM Studio) | Deve funcionar | Deve funcionar | **Testado** com servidor simulado (E2E); Ollama/LM Studio reais não testados | Não testado |
| Claude (Anthropic) e OpenAI | Deve funcionar | Deve funcionar | **Testado** com servidores simulados (SDK oficial no caso do Claude); serviços reais não testados | Não testado |
| Mensagens de erro da §23 com provider real (401, 402, 429, 529, 400, offline, tempo-limite) | Deve funcionar | Deve funcionar | **Testado** (E2E com servidores simulados) | Não testado |
| Ferramentas (hora, versão) e pedido de permissão no balão | Deve funcionar | Deve funcionar | **Testado** (E2E com o Demo e ferramentas de teste; servidor compatível com OpenAI simulado) | Não testado |
| Ferramentas com Ollama, Claude e OpenAI de verdade | Deve funcionar | Deve funcionar | Não testado (testado só com servidores simulados e o SDK oficial) | Não testado |
| Chave de API cifrada (`safeStorage`) | Deve funcionar (DPAPI) | Deve funcionar (Keychain) | **Testado** só sem keyring (`basic_text`, com a confirmação); com gnome-libsecret/kwallet não testado | Não testado |
| Zero requisições de rede (ao abrir e conversando no Demo) | Deve funcionar | Deve funcionar | **Testado** (E2E + log de rede) | Não testado |
| Iniciar com o sistema | Deve funcionar (só instalado) | Deve funcionar (só instalado) | N/A no MVP | N/A no MVP |
| Pacote instalável | Gerado pelo workflow `build-artifacts` ou `npm run package:win` (não testado; o NSIS não pode ser gerado neste ambiente) | Não testado | **Testado**: AppImage gerado e iniciado | — |
| Copiar diagnóstico | Deve funcionar | Deve funcionar | **Testado** (E2E) | Não testado |
| Electron Fuses aplicados | Deve funcionar | Deve funcionar | **Testado** (`@electron/fuses read`) | — |

\* No Wayland, o Electron não pode posicionar janelas, ler o cursor global nem registrar atalhos globais. Contorno a validar: iniciar com `--ozone-platform=x11` (XWayland).

## Medições

`npm run measure` (SPEC §25). CPU = média de todos os processos, em % de um núcleo. Memória = privada no Windows, PSS no Linux.

| Ambiente | Personagem visível | CPU à disposição | CPU dormindo | Memória | Observação |
|----------|--------------------|------------------|--------------|---------|------------|
| Linux/Xvfb, contêiner, renderização por software (v0.6.0) | 0,7 s | 0,3% | 0,1% | ~290 MB | Sem GPU: o processo de GPU por software pesa mais. Acima da meta de 250 MB só neste ambiente. |
| Windows x64, Electron 45.0.0, computador do dono do produto (v0.6.0, 26/10/2026) | < 2 s | 0,07% | 0,01% | 241 MB | Dentro das três metas. 5 processos; working set somado de 433 MB (só referência: conta as bibliotecas compartilhadas várias vezes). |

Metas: personagem em < 2 s; CPU parado < 0,5%; memória ≤ 250 MB.

## Observações

- Fase 3: a suíte E2E inteira (26 testes) passou 3 vezes seguidas (78/78), sem tentativas extras.
- Fase 4: a suíte E2E inteira (32 testes) passou 3 vezes seguidas (96/96), sem tentativas extras. O AppImage 0.4.0 foi gerado e iniciado (personagem na tela, SDK da Anthropic incluído no pacote).
- Este ambiente não alcança Ollama, LM Studio, Anthropic nem OpenAI de verdade: a conversa real com cada um está no roteiro manual.
- Fase 5: a suíte E2E inteira (38 testes) passou 3 vezes seguidas (114/114), sem tentativas extras.
- Fase 6: a suíte E2E inteira (42 testes) passou 3 vezes seguidas (126/126); os 3 testes de vários monitores (`npm run test:e2e:monitors`) passaram 3 vezes seguidas (9/9). O AppImage 0.6.0 foi gerado e iniciado; Fuses conferidos com `@electron/fuses read` e `ELECTRON_RUN_AS_NODE` recusado. O AppImage 0.5.0 foi gerado e iniciado; com `CLIPSTER_DEV_TOOLS=1`, as ferramentas de teste não foram registradas no app empacotado.
- Uma execução da suíte E2E falhou uma vez, no teste de arrasto, enquanto havia processos do Electron de execuções manuais ainda abertos no contêiner. Em seguida, passou 12/12 isolado e 28/28 com a suíte inteira repetida 4 vezes. O CI tenta de novo uma vez automaticamente.
