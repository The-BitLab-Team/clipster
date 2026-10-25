# Permissões

Como o Clipster decide o que pode fazer no seu computador (SPEC §22). Situação na versão 0.6.0.

## O que existe hoje

A IA pode usar duas ferramentas, e nenhuma acessa nada do computador:

| Ferramenta | O que faz | Permissão |
|------------|-----------|-----------|
| `getCurrentTime` | Data, hora e fuso horário do sistema | Nenhuma |
| `getClipsterVersion` | Versões do Clipster, do Electron e do Chromium, e o sistema operacional | Nenhuma |

Fora as ferramentas, o Clipster só mexe nos próprios arquivos (configurações, histórico se você ligar, chaves cifradas, logs). A sessão do Electron nega toda permissão web: câmera, microfone, notificações web, área de transferência pelo navegador etc. O botão "Copiar" do balão escreve na área de transferência só quando você clica; nada a lê.

Em desenvolvimento (`CLIPSTER_DEV_TOOLS=1`, nunca no app instalado) há duas ferramentas de mentira, para testar o pedido de permissão: `demoDestructiveAction` (finge apagar um arquivo) e `demoReadAction` (finge listar uma pasta). Nenhuma toca em disco.

## Permissões e riscos

Cada ferramenta declara as permissões de que precisa e um nível de risco. Concedidas, valem **só para aquela ferramenta** e aquelas permissões.

| Permissão | O que libera |
|-----------|--------------|
| `clipboard.read` / `clipboard.write` | Ler ou escrever na área de transferência |
| `filesystem.read` / `filesystem.write` | Ler arquivos / alterar ou apagar arquivos |
| `applications.open` | Abrir programas |
| `notifications.send` | Mostrar notificações |
| `screen.observe` | Ver a tela (não previsto para o MVP) |
| `network.fetch` | Acessar a internet |

| Risco | O que você pode escolher |
|-------|--------------------------|
| Leitura (`read`) | Uma vez · Nesta sessão · Sempre |
| Alteração (`write`) | Uma vez · Nesta sessão |
| Não dá para desfazer (`destructive`) | **Só uma vez, toda vez.** Nunca "sempre" |

## Como o pedido funciona

1. A IA pede uma ferramenta. O Clipster confere se ela existe e se os argumentos são válidos; senão, recusa sem perguntar nada.
2. Se a ferramenta precisa de permissão e você ainda não deu, o pedido aparece **dentro do balão**, com o texto escrito pela própria ferramenta (nunca pela IA): por exemplo, *Apagar o arquivo "relatorio.docx"*. O personagem mostra um aviso.
3. O foco começa em **Cancelar**. `Esc` também recusa. Sem resposta em **2 minutos**, o pedido é cancelado. **Parar** cancela a resposta inteira.
4. Permitida, a ferramenta roda (com 10 s de limite) e o resultado volta para a IA **como dado**: nada que uma ferramenta devolva concede permissão ou dispara outra ferramenta.
5. No máximo **5 ferramentas** por mensagem.

O balão não abre sozinho para pedir permissão: se estiver fechado, o aviso no personagem indica que há algo esperando.

## Onde ver e como revogar

**Configurações › Privacidade › Permissões das ferramentas** lista o que vale além de uma vez:

- **Sempre:** guardado em `settings.json` e vale até você revogar.
- **Até fechar o Clipster** ("nesta sessão"): só na memória.

Cada item tem **Revogar**. Depois de revogar, a ferramenta volta a perguntar. Desinstalar o app não apaga `settings.json` (fica em `%APPDATA%\Clipster`); para começar do zero, apague essa pasta.

## Garantias técnicas

- Ferramentas rodam só no main process. Nenhuma janela executa ferramentas.
- Uma permissão só nasce de uma resposta sua a um pedido pendente (`permissions:respond`, só pelo balão). O main recusa escolhas que o risco não permite, mesmo vindas do balão.
- `settings:update` não altera permissões. Concessões lidas do arquivo valem só até onde o risco permite: um `settings.json` editado à mão não libera ação destrutiva.
- Argumentos que aparecem no pedido não aceitam caracteres de controle nem de direção de texto (um nome de arquivo não pode se disfarçar de outro).
- Auditoria no log (`tool.audit`): ferramenta, decisão, sucesso e duração. Nunca os argumentos nem o resultado.

Testes: `tests/unit/permissions.test.ts`, `tests/unit/tools.test.ts`, `tests/unit/assistantTools.test.ts`, `tests/integration/ipc.test.ts` e `tests/e2e/tools.spec.ts`.
