# Privacidade

## O que o Clipster guarda

Tudo fica na pasta de dados do app, só no seu computador:

| Sistema | Pasta |
|---------|-------|
| Windows | `%APPDATA%\Clipster` |
| macOS | `~/Library/Application Support/Clipster` |
| Linux | `~/.config/Clipster` |

Em desenvolvimento (`npm run dev`), a pasta se chama `Clipster (dev)`.

| Arquivo | Conteúdo |
|---------|----------|
| `settings.json` | Preferências, personalidade, posição do personagem, provider e modelo de IA escolhidos (nunca a chave) e as permissões "sempre" das ferramentas |
| `secrets.json` | Chaves de API, **cifradas** pelo cofre do sistema. Só existe se você salvar uma chave |
| `settings.corrupt-<data>.json` | Cópia de segurança, criada só se o arquivo de configurações estiver inválido |
| `history.json` | Conversas. **Só existe se você ligar** Configurações › Privacidade › "Salvar histórico de conversas" |
| `history.corrupt-<data>.json` | Cópia de segurança, criada só se o arquivo de histórico estiver ilegível |
| `logs/clipster.log` (+ `.1`, `.2`) | Eventos técnicos em JSON Lines, até ~3 MB no total |

Os logs registram eventos técnicos (início, erros, avisos de segurança, duração e código de erro de uma resposta). Não registram o conteúdo das conversas. Chaves, tokens e senhas são removidos automaticamente antes de qualquer gravação.

## Conversas

- **Sem histórico (padrão):** a conversa existe só na memória do app, até você clicar em "Nova conversa" ou fechar o Clipster.
- **Com histórico:** as conversas vão para `history.json`. Ao abrir o app, a mais recente volta para o balão. O tempo de guarda segue a opção "Manter histórico por" (7, 30 ou 90 dias, ou sempre); conversas mais antigas são apagadas ao abrir o app e quando você muda a opção. O arquivo é limitado a ~5 MB: passando disso, as conversas mais antigas saem primeiro.
- **Limpar histórico** apaga o arquivo e a conversa atual, depois de uma confirmação.
- **Desligar o histórico** para de gravar na hora, e o Clipster pergunta se você quer apagar o que já foi salvo.
- **Modo demonstração:** as respostas são pré-programadas e nada sai do computador. Um teste automatizado conversa no modo Demo e confere que não houve nenhuma requisição de rede.
- O botão **Copiar** coloca o texto na área de transferência só quando você clica nele. O Clipster nunca lê a área de transferência.

O Chromium também cria pastas de cache próprias (por exemplo `Cache`, `GPUCache`) dentro da mesma pasta.

## O que o Clipster não faz

- Não observa tela, teclado, área de transferência, arquivos, outros programas ou histórico do navegador.
- Não tem telemetria nem estatísticas de uso.
- Não faz nenhuma requisição de rede ao abrir nem ao conversar no modo Demo. Isso é verificado por testes automatizados que leem o log de rede do Chromium. Com uma IA configurada, a rede é usada só para falar com ela.
- Não carrega imagens que apareçam nas respostas (uma imagem remota poderia avisar a um servidor que a resposta foi lida). No lugar delas aparece só a descrição.

## O que vai para a IA

Com uma IA configurada, cada pergunta envia **só para o provedor escolhido** (um servidor local, como Ollama ou LM Studio, ou um serviço na nuvem, como Claude ou OpenAI):

- as instruções do Clipster (personalidade e regras);
- o trecho recente da conversa (até 20 mensagens ou ~12.000 caracteres);
- o nome e a versão do app, o sistema operacional, a data, a hora e o fuso horário.

Nunca vão nome de usuário, nome do computador, pasta pessoal, arquivos, tela ou área de transferência (há um teste que confere isso nas instruções enviadas). A chave de API vai só no cabeçalho de autenticação, para o provedor em que foi salva.

Com um servidor **local**, nada sai do seu computador. Com um serviço **na nuvem**, o que você escreve passa a seguir também a política de privacidade desse serviço. O Clipster não manda nada para nenhum outro lugar: listar modelos e "Testar conexão" falam só com o endereço configurado, e só quando você pede.

**Chaves de API:** ficam cifradas em `secrets.json` (DPAPI no Windows, Keychain no macOS, keyring no Linux). A tela de Configurações nunca recebe a chave de volta, só os últimos 4 caracteres. Os logs nunca registram chaves. No Linux sem keyring, a cifra não protege de verdade; o Clipster avisa e só salva se você confirmar.

## Ferramentas e permissões

A IA pode usar ferramentas do Clipster. Hoje são duas, e nenhuma acessa nada do computador:

- **Consultar o relógio:** data, hora e fuso.
- **Consultar a versão do Clipster:** versões do app, do Electron e do Chromium, e o sistema operacional.

Qualquer ferramenta que acesse algo do computador (arquivos, área de transferência, programas, internet) pede permissão antes, no balão, dizendo o que vai fazer. Você escolhe "uma vez", "nesta sessão" ou "sempre", conforme o risco; ações que não dá para desfazer são confirmadas toda vez. O que foi permitido além de uma vez aparece em Configurações › Privacidade › Permissões, com Revogar. As permissões "sempre" ficam em `settings.json`; as "nesta sessão" somem ao fechar o app.

O resultado de uma ferramenta vai para o provedor de IA escolhido, junto com a conversa. O log registra que a ferramenta foi usada, a decisão e se deu certo, nunca os argumentos nem o resultado.

## Como apagar tudo

Desinstale o app e apague a pasta de dados indicada acima. Para remover só uma chave de API, use "Remover chave" em Configurações › IA.
