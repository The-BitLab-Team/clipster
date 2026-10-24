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
| `logs/clipster.log` (+ `.1`, `.2`) | Eventos técnicos em JSON Lines, até ~3 MB no total |

Os logs registram eventos técnicos (início, erros, avisos de segurança). Não registram conteúdo de conversas. Chaves, tokens e senhas são removidos automaticamente antes de qualquer gravação.

O Chromium também cria pastas de cache próprias (por exemplo `Cache`, `GPUCache`) dentro da mesma pasta.

## O que o Clipster não faz

- Não observa tela, teclado, área de transferência, arquivos, outros programas ou histórico do navegador.
- Não tem telemetria nem estatísticas de uso.
- Não faz nenhuma requisição de rede ao abrir. Isso é verificado por um teste automatizado que lê o log de rede do Chromium.

## A partir da Fase 4 (IA)

Quando você configurar um provedor de IA, as mensagens que você escrever serão enviadas **só para o provedor escolhido**: um servidor local (Ollama, LM Studio) ou um serviço na nuvem (Claude, OpenAI). O histórico de conversas fica **desligado por padrão**.

## Como apagar tudo

Desinstale o app e apague a pasta de dados indicada acima.
