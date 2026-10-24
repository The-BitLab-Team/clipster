# Permissões

## Hoje (versão 0.1.0)

O Clipster **não acessa nada do seu computador** além das próprias configurações e logs. Não há ferramentas nem permissões para conceder. A sessão do Electron nega toda permissão web (câmera, microfone, notificações web, área de transferência via navegador etc.).

## Modelo planejado (Fase 5, SPEC §22)

Cada ferramenta declara as permissões de que precisa e um nível de risco:

| Permissão | Exemplo de uso futuro |
|-----------|-----------------------|
| `clipboard.read` / `clipboard.write` | Ler ou escrever na área de transferência quando você pedir |
| `filesystem.read` / `filesystem.write` | Abrir ou salvar um arquivo indicado |
| `applications.open` | Abrir um programa |
| `notifications.send` | Lembretes criados por você |
| `screen.observe` | Não planejada para o MVP |
| `network.fetch` | Buscar algo na internet a seu pedido |

| Risco | Escopos possíveis |
|-------|-------------------|
| `read` | uma vez · nesta sessão · sempre |
| `write` | uma vez · nesta sessão |
| `destructive` | **somente uma vez**; nunca "sempre permitir" |

Regras:

- O texto do pedido de confirmação é gerado pela própria ferramenta, com os argumentos validados, e nunca pelo texto livre da IA.
- O botão inicial é **Cancelar** para ações destrutivas; sem resposta = cancelar.
- Resultados de ferramentas são tratados como dados não confiáveis e nunca concedem permissões.
- Permissões concedidas aparecem em Configurações › Privacidade e podem ser revogadas a qualquer momento.
