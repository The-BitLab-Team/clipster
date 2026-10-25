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
| `settings.json` | Preferências, personalidade, posição do personagem |
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
- Não faz nenhuma requisição de rede ao abrir nem ao conversar no modo Demo. Isso é verificado por testes automatizados que leem o log de rede do Chromium.
- Não carrega imagens que apareçam nas respostas (uma imagem remota poderia avisar a um servidor que a resposta foi lida). No lugar delas aparece só a descrição.

## A partir da Fase 4 (IA)

Quando você configurar um provedor de IA, as mensagens que você escrever, junto com as instruções do Clipster e o trecho recente da conversa, serão enviadas **só para o provedor escolhido**: um servidor local (Ollama, LM Studio) ou um serviço na nuvem (Claude, OpenAI). Além do texto da conversa, vão apenas: o nome e a versão do app, o sistema operacional, a data, a hora e o fuso horário. Nunca vão nome de usuário, arquivos, tela ou área de transferência.

## Como apagar tudo

Desinstale o app e apague a pasta de dados indicada acima.
