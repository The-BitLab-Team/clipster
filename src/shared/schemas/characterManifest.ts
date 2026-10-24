import * as z from 'zod/mini';
import { CHARACTER_STATES, type CharacterState } from '../character/states';

/**
 * Manifesto de um pacote de personagem (SPEC §5.4). Usa `zod/mini` porque também é
 * validado dentro da janela do personagem, onde o tamanho do bundle importa.
 *
 * Formato `svg-rig`: um único SVG com partes nomeadas (alças, olhos, bocas, acessórios)
 * e um CSS de poses que mostra/esconde/move essas partes conforme `data-state`.
 * Outros formatos (sprite sheet, WebP, Lottie, sequência PNG) entram como novos adaptadores.
 */

const StateEntrySchema = z.object({
  /** Permite a piscada ocasional nesta pose. */
  blink: z.boolean()
});

const CharacterStateSchema = z.enum(CHARACTER_STATES);

export const CharacterManifestSchema = z
  .object({
    id: z.string().check(z.minLength(1)),
    name: z.string().check(z.minLength(1)),
    format: z.literal('svg-rig'),
    size: z.object({
      width: z.number().check(z.positive()),
      height: z.number().check(z.positive())
    }),
    /** Arquivo SVG com as partes nomeadas. */
    rig: z.string().check(z.minLength(1)),
    /** Arquivo CSS com as poses de cada estado. */
    styles: z.string().check(z.minLength(1)),
    states: z.partialRecord(CharacterStateSchema, StateEntrySchema),
    /** Pose usada para estados sem arte própria. Precisa existir em `states`. */
    fallbackState: CharacterStateSchema
  })
  .check(
    z.refine((manifest) => manifest.states[manifest.fallbackState] !== undefined, {
      message: 'fallbackState precisa estar em states'
    })
  );

export type CharacterManifest = z.infer<typeof CharacterManifestSchema>;

export function parseCharacterManifest(value: unknown): CharacterManifest {
  return CharacterManifestSchema.parse(value);
}

/** Estado sem pose no pacote → usa o fallback (permite entregar a arte aos poucos). */
export function resolvePose(manifest: CharacterManifest, state: CharacterState): CharacterState {
  return manifest.states[state] === undefined ? manifest.fallbackState : state;
}

export function allowsBlink(manifest: CharacterManifest, state: CharacterState): boolean {
  return manifest.states[resolvePose(manifest, state)]?.blink === true;
}
