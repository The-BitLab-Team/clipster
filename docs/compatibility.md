# Compatibilidade

Legenda: **Testado** = verificado de fato · **Deve funcionar** = implementado, mas não verificado nessa plataforma · **Não testado** = sem verificação nem expectativa firme · **N/A** = não se aplica.

Atualizado em 24/10/2026 (versão 0.2.0). Até aqui, os testes rodaram apenas num **Linux sem desktop (Xvfb)** dentro de um contêiner: lá não há compositor (transparência real), bandeja nem vários monitores. O roteiro para o Windows está em [`qa-checklist.md`](qa-checklist.md).

## Por recurso

| Recurso | Windows 10/11 | macOS | Linux X11 | Linux Wayland |
|---------|---------------|-------|-----------|---------------|
| App inicia, personagem aparece | Deve funcionar | Deve funcionar | **Testado** (Xvfb, E2E) | Não testado |
| Transparência real | Deve funcionar | Deve funcionar | Deve funcionar (exige compositor) | Não testado |
| Não rouba foco (`showInactive`) | Deve funcionar | Deve funcionar | Deve funcionar | Não testado |
| Fora da barra de tarefas | Deve funcionar | N/A (Dock) | Deve funcionar | Não testado |
| Clique através das áreas transparentes | Deve funcionar | Deve funcionar | N/A (sem `forward`) | N/A |
| Arrasto | Deve funcionar | Deve funcionar | **Testado** (E2E, eventos sintéticos) | Não funciona nativamente* |
| Posição restaurada ao reabrir | Deve funcionar | Deve funcionar | **Testado** (E2E) | Não funciona nativamente* |
| Vários monitores / DPI / monitor removido | Deve funcionar (lógica testada em unidade) | Deve funcionar | Deve funcionar | Não testado |
| Bandeja | Deve funcionar | Deve funcionar | Deve funcionar (AppIndicator) | Não testado |
| Menu de contexto | Deve funcionar | Deve funcionar | Deve funcionar | Não testado |
| Configurações (abrir, alterar, persistir) | Deve funcionar | Deve funcionar | **Testado** (E2E) | Não testado |
| Comandos da bandeja (personalidade, esconder, mostrar) | Deve funcionar | Deve funcionar | **Testado** (E2E, via ganchos) | Não testado |
| Sair encerra o processo | Deve funcionar | Deve funcionar | **Testado** (E2E) | Não testado |
| Estados do personagem (10 poses) | Deve funcionar | Deve funcionar | **Testado** (E2E + capturas de cada pose) | Não testado |
| Sono por inatividade e acordar confuso | Deve funcionar | Deve funcionar | **Testado** (E2E com tempo curto) | Não testado |
| Animações finitas em repouso; nenhuma com "Desligadas" | Deve funcionar | Deve funcionar | **Testado** (E2E com `document.getAnimations()`) | Não testado |
| Zero requisições de rede | Deve funcionar | Deve funcionar | **Testado** (E2E + log de rede) | Não testado |
| Iniciar com o sistema | Deve funcionar (só instalado) | Deve funcionar (só instalado) | N/A no MVP | N/A no MVP |
| Pacote instalável | Gerado pelo workflow `build-artifacts` ou `npm run package:win` (não testado) | Não testado | **Testado**: AppImage gerado e iniciado | — |
| Electron Fuses aplicados | Deve funcionar | Deve funcionar | **Testado** (`@electron/fuses read`) | — |

\* No Wayland, o Electron não pode posicionar janelas nem ler o cursor global. Contorno a validar: iniciar com `--ozone-platform=x11` (XWayland).

## Medições

| Ambiente | CPU em repouso | Memória (PSS, todos os processos) | Observação |
|----------|----------------|-----------------------------------|------------|
| Linux/Xvfb, contêiner, renderização por software | ~0% (média de 20 s) | ~270 MB | Sem GPU; o processo de GPU por software pesa mais. Medir no Windows. |
| Linux/Xvfb, v0.2.0, personagem **dormindo** (depois que os "z" param) | ~0,3% (média de 20 s) | — | Pose estática; nenhuma animação contínua. |
| Windows | — | — | Preencher pelo `qa-checklist.md`. |

## Observações

- Uma execução da suíte E2E falhou uma vez, no teste de arrasto, enquanto havia processos do Electron de execuções manuais ainda abertos no contêiner. Em seguida, passou 12/12 isolado e 28/28 com a suíte inteira repetida 4 vezes. O CI tenta de novo uma vez automaticamente.
