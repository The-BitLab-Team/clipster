/** Identidade do app. Ver SPEC §0.3 (D4, D6). */
export const APP_ID = 'com.marcosland.clipster';
export const APP_NAME = 'Clipster';

/** Protocolo próprio usado para servir a interface em produção (SPEC §26, item 2). */
export const APP_PROTOCOL = 'app';
export const APP_HOST = 'clipster';
export const APP_BASE_URL = `${APP_PROTOCOL}://${APP_HOST}`;

/**
 * Link do repositório exibido em Configurações › Sobre.
 * `null` enquanto a decisão D6 (repositório público ou privado) estiver pendente.
 */
export const REPOSITORY_URL: string | null = null;
