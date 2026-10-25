/** Limites das ferramentas e das permissões (SPEC §22). */

/** No máximo isto de chamadas de ferramenta por mensagem do usuário (evita loops). */
export const MAX_TOOL_CALLS_PER_MESSAGE = 5;

/** Sem resposta ao pedido de permissão nesse tempo → cancelado. */
export const PERMISSION_TIMEOUT_MS = 120_000;

/** Uma ferramenta que passe disso é interrompida. */
export const TOOL_EXECUTION_TIMEOUT_MS = 10_000;

/** Resultado devolvido ao modelo, em caracteres (o excesso é cortado). */
export const TOOL_RESULT_MAX_CHARS = 8_000;
