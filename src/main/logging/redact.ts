/**
 * Redação de dados sensíveis antes de qualquer log (SPEC §24).
 * Remove valores de chaves suspeitas e padrões de credenciais em textos.
 */

export const REDACTED = '[REDACTED]';

const SENSITIVE_KEY =
  /api[-_]?key|authorization|auth[-_]?token|token|secret|password|passwd|cookie/i;

const SECRET_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{12,}/g,
  /\bAIza[0-9A-Za-z_-]{20,}/g
];

const MAX_DEPTH = 6;

export function redactString(value: string): string {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, REDACTED), value);
}

function redactInner(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[Truncated]';
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack === undefined ? undefined : redactString(value.stack)
    };
  }

  if (Array.isArray(value)) {
    return value.map((item: unknown) => redactInner(item, depth + 1, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactInner(entry, depth + 1, seen);
  }
  return output;
}

export function redact(value: unknown): unknown {
  return redactInner(value, 0, new WeakSet());
}
