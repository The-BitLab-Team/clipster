import { z } from 'zod';
import { PersonalityIdSchema } from '../schemas/settings';

/** Validação dos perfis de personalidade (SPEC §7.1). Usada no main e nos testes. */

const LocalizedStringSchema = z.strictObject({
  'pt-BR': z.string().trim().min(1),
  en: z.string().trim().min(1)
});

export const PersonalityProfileSchema = z.strictObject({
  id: PersonalityIdSchema,
  systemInstructions: z.string().trim().min(20).max(4000),
  temperaturePreference: z.number().min(0).max(2).optional(),
  microcopy: z.strictObject({
    greeting: z.array(LocalizedStringSchema).min(1),
    modeActivated: LocalizedStringSchema,
    wakeUp: z.array(LocalizedStringSchema).min(1),
    demoFallback: LocalizedStringSchema
  })
});
