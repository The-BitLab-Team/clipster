/** Regras de endereço dos servidores de IA, usadas no main e nas Configurações (SPEC §20.4). */

/** Servidor na própria máquina (Ollama, LM Studio…): `localhost`, `127.x`, `::1`. */
export function isLocalUrl(input: string): boolean {
  try {
    const host = new URL(input).hostname.replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '::1' || /^127(\.\d{1,3}){3}$/.test(host);
  } catch {
    return false;
  }
}

/** Uma chave por `http://` para fora da máquina viaja sem criptografia. */
export function sendsKeyInsecurely(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).protocol === 'http:' && !isLocalUrl(baseUrl);
  } catch {
    return false;
  }
}

/** Só `http:` e `https:`. */
export function isHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Endereços prontos para os servidores mais comuns. */
export const SERVER_PRESETS = {
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
  openai: 'https://api.openai.com/v1'
} as const;

/**
 * Painéis das contas na nuvem, para o erro de cota/cobrança (SPEC §23). Só a página inicial:
 * os caminhos internos mudam com mais frequência e o usuário encontra "Billing" a partir dela.
 */
export const PROVIDER_CONSOLES = {
  anthropic: 'https://platform.claude.com/',
  openai: 'https://platform.openai.com/'
} as const;

export function isProviderConsoleUrl(url: string): boolean {
  return (Object.values(PROVIDER_CONSOLES) as string[]).includes(url);
}

export type ServerPreset = keyof typeof SERVER_PRESETS;
