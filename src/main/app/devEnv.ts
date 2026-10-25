import { readFileSync } from 'node:fs';

/**
 * Leitura mínima de `.env` (SPEC §21): **só em builds de desenvolvimento**, para o
 * desenvolvedor testar sem digitar a chave nas Configurações. Sem dependência externa.
 * Linhas `NOME=valor`; `#` comenta; aspas simples ou duplas em volta do valor são removidas.
 */
export function parseDotEnv(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match === null) continue;
    const [, name = '', rawValue = ''] = match;
    let value = rawValue.trim();
    const quoted = /^(['"])(.*)\1$/.exec(value);
    if (quoted !== null) value = quoted[2] ?? '';
    else value = value.replace(/\s+#.*$/, '');
    result[name] = value;
  }
  return result;
}

export function readDotEnv(filePath: string): Record<string, string> {
  try {
    return parseDotEnv(readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}
