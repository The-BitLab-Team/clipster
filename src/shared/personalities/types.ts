import type { Locale } from '../i18n';
import type { PersonalityId } from '../schemas/settings';

/** Texto nos dois idiomas da interface (SPEC §4). */
export type LocalizedString = Readonly<Record<Locale, string>>;

/**
 * Perfil declarativo de uma personalidade (SPEC §7.1). Nome, descrição e fala de exemplo
 * são rótulos de interface e ficam no i18n (`personality.<id>.*`); aqui ficam as
 * instruções para a IA e as falas do personagem fora da IA.
 */
export interface PersonalityProfile {
  id: PersonalityId;
  /** Camada de personalidade do prompt de sistema (Apêndice A). */
  systemInstructions: string;
  /** Dica para o provider; ele pode ignorar se o modelo não suportar. */
  temperaturePreference?: number;
  microcopy: {
    /** Conversa vazia. */
    greeting: readonly LocalizedString[];
    /** Mostrada no balão ao trocar para esta personalidade. */
    modeActivated: LocalizedString;
    /** Clicado enquanto dormia. */
    wakeUp: readonly LocalizedString[];
    /** Modo Demo, pergunta fora do repertório. */
    demoFallback: LocalizedString;
  };
}
