# CLAUDE.md — Como trabalhar no Clipster

Clipster é um companheiro de desktop animado (Electron + React + TypeScript) com IA, personalidade alternável (Prestativo/Espirituoso) e foco em privacidade.

**O que construir está em [`SPEC.md`](SPEC.md), a fonte da verdade.** Este arquivo define **como** trabalhar. Se os dois divergirem, `SPEC.md` vence.

Atue como engenheiro principal do projeto, cobrindo arquitetura, desktop, TypeScript, UI/UX, segurança e QA. O objetivo é **implementar**, não descrever: ao final de cada sessão deve existir código que roda.

---

## 1. Ao iniciar cada sessão

1. Inspecione o repositório: arquivos existentes, `git status`, último commit e `docs/decisions.md`.
2. Verifique as versões locais de Node e npm. Compare com `.nvmrc` e com SPEC §16.
3. Identifique a fase atual do roadmap (SPEC §34) e o que falta para o critério de saída dela.
4. Preserve o código existente que funciona. Não reescreva sem necessidade.
5. Apresente em poucas linhas: estado encontrado, fase atual, plano curto. **Depois comece a executar imediatamente.**

## 2. Trabalhe fase a fase

- Siga as fases da SPEC §34 em ordem. Uma fase só termina quando o critério de saída dela passa.
- Não pare depois de gerar scaffolding: continue até o critério de saída da fase ou até um bloqueio real.
- **Validação contínua:** depois de cada mudança estrutural, rode `npm run typecheck` e os testes relevantes e corrija os erros **antes** de seguir. Não acumule dezenas de mudanças sem teste.
- Ao concluir uma fase, rode `lint`, `typecheck`, `test` e `build` completos e faça um commit (se for um repositório git) no formato Conventional Commits, em inglês.

## 3. Autorizações

Você pode, sem perguntar: criar, editar e organizar arquivos e diretórios; instalar as dependências necessárias; rodar builds, testes e lint; corrigir os erros encontrados.

Pergunte **somente** quando houver uma decisão de produto significativa que não possa ser inferida da SPEC. As decisões D1–D7 (SPEC §0.3) **não bloqueiam**: use o padrão provisório indicado.

## 4. Decisões técnicas

Quando a SPEC não definir um detalhe, escolha a alternativa mais **simples**, mais **segura**, mais **fácil de manter**, **compatível com versões modernas**, que **reduza dependências** e **preserve a evolução**, nessa ordem. Registre a decisão em `docs/decisions.md` (data, decisão, motivo, alternativas descartadas). Não interrompa o trabalho por decisões triviais.

## 5. Versões e dependências

- Antes de instalar, confira as versões estáveis atuais e a compatibilidade entre elas (`npm view <pacote> version peerDependencies engines`). A tabela da SPEC §16 é um ponto de partida verificado em 24/10/2026, não uma regra fixa.
- Restrições conhecidas em 24/10/2026: `typescript-eslint` 8.x exige `typescript <6.1.0` (usar TS 6.0.x, não a 7.x); `@vitejs/plugin-react` 6 exige Vite 8; `electron-vite` 6 é a primeira versão com suporte a Vite 8.
- Antes de adicionar uma biblioteca: ela é necessária? É mantida? É popular e madura? Evite pacotes para funcionalidades triviais.
- Rode `npm audit` e corrija o que puder ser corrigido sem quebrar compatibilidade.

## 6. Debugging

Quando um comando falhar: leia o erro completo → determine a causa → corrija a causa → rode de novo.

- Não contorne problemas removendo funcionalidades importantes.
- Não silencie o TypeScript com `any`, `@ts-ignore` ou casts inseguros. Se um cast for inevitável, escreva o motivo no próprio código.

## 7. Invariantes que nunca podem ser quebradas

- Renderer sem Node, sem filesystem, sem rede, sem segredos. `contextIsolation`, `sandbox` e `nodeIntegration: false` em todas as janelas. Nunca expor `ipcRenderer` inteiro.
- Todo canal IPC: lista explícita, validação de remetente e payload validado com Zod (SPEC §26).
- Chaves de API: só no main, cifradas com `safeStorage`, nunca devolvidas ao renderer, nunca em logs, nunca no repositório (SPEC §21).
- Nenhuma janela do Clipster rouba foco sem ação do usuário (SPEC §2).
- Prompts **somente** em `src/shared/personalities/`. Textos de interface **somente** via i18n.
- Nenhum nome de modelo de IA fixo no código. O modelo é sempre configurável.
- Nada de arte ou assets do Clippy/Microsoft (SPEC §5.1).
- Ações destrutivas sempre pedem confirmação, sem "sempre permitir" (SPEC §22).

## 8. Honestidade sobre o que foi testado

- Não finja ter testado plataformas ou comportamentos aos quais você não tem acesso.
- Se você roda em contêiner ou sem desktop gráfico, diga isso e liste quais itens do critério de pronto (SPEC §36, itens 10–17) dependem da verificação manual do dono do produto.
- Mantenha `docs/compatibility.md` atualizado com **Testado / Deve funcionar / Ainda não testado**.

## 9. Comandos

| Objetivo | Comando |
|----------|---------|
| Desenvolver | `npm run dev` |
| Verificar | `npm run lint` · `npm run typecheck` · `npm run test` |
| E2E | `npm run test:e2e` (no Linux sem desktop: `xvfb-run -a npm run test:e2e`) |
| Build | `npm run build` |
| Empacotar (sistema atual) | `npm run package` |

## 10. Relatório ao final da sessão

Entregue, de forma concisa:

- funcionalidades implementadas nesta sessão;
- estrutura final (só o que mudou);
- decisões arquiteturais importantes (com link para `docs/decisions.md`);
- comandos de desenvolvimento, testes e build/package;
- **resultado real** dos comandos executados (não presuma sucesso);
- itens do critério de pronto verificados × pendentes de verificação manual;
- limitações conhecidas;
- próximos itens do roadmap.

---

## Para o dono do produto: como iniciar uma sessão

Abra o Claude Code nesta pasta e envie, por exemplo:

> Leia o CLAUDE.md e o SPEC.md. Inspecione o repositório e execute a Fase 0 e a Fase 1 do roadmap até os critérios de saída passarem. Ao final, entregue o relatório da seção 10.

Nas sessões seguintes, troque as fases ("execute a Fase 2"). Sessões menores, uma ou duas fases por vez, dão resultados mais confiáveis do que pedir o projeto inteiro de uma vez.
