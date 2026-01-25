# Clipster

Assistente de desktop moderno inspirado no Clippy, com foco em modularidade e expansão futura.

## Visão geral
- Electron + TypeScript
- Janela flutuante transparente com personagem animado
- Dois modos de personalidade (Helpful e Witty)
- UI mínima com chat e alternância de modo
- Arquitetura pronta para integrar IA local ou via API

## Estrutura
- src/main: processo principal (janela, bandeja, IPC)
- src/preload: bridge seguro entre UI e Node
- src/renderer: UI (HTML/CSS/TS)
- src/shared: tipos compartilhados
- config/personalities: perfis de personalidade

## Como rodar
1. Instale dependências:
   - npm install
2. Build e execução:
   - npm run start

## Expansão futura
- TODO: integrar LLM local (ex.: Ollama) ou API externa
- TODO: renderizar sprites e animações com assets reais
- TODO: comandos do sistema operacional via módulos nativos
- TODO: gravação de contexto e histórico persistente
