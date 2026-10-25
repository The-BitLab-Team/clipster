import { getPersonality, PERSONALITIES } from '../../shared/personalities';
import { PersonalityProfileSchema } from '../../shared/personalities/schema';
import type { PersonalityProfile } from '../../shared/personalities/types';
import type { PersonalityId } from '../../shared/schemas/settings';
import type { Logger } from '../logging/logger';

/**
 * Resolve a personalidade ativa (SPEC §7.1). A escolha é persistida pelo SettingsStore,
 * que também a transmite a todas as janelas; a troca vale a partir da próxima requisição.
 */

export interface PersonalityManagerOptions {
  /** Id salvo nas configurações. */
  current: () => string;
  persist: (id: PersonalityId) => void;
  logger: Logger;
}

export class PersonalityManager {
  constructor(private readonly options: PersonalityManagerOptions) {
    for (const profile of Object.values(PERSONALITIES)) {
      const result = PersonalityProfileSchema.safeParse(profile);
      if (!result.success) {
        options.logger.error('personality.invalid_profile', {
          id: profile.id,
          issue: result.error.issues[0]?.message ?? 'inválido'
        });
      }
    }
  }

  get active(): PersonalityProfile {
    const id = this.options.current();
    const profile = getPersonality(id);
    if (profile.id !== id) {
      this.options.logger.warn('personality.unknown_id', { id, fallback: profile.id });
    }
    return profile;
  }

  set(id: PersonalityId): void {
    this.options.persist(id);
  }
}
