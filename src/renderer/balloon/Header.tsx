import type { Translator } from '../../shared/i18n';
import type { PersonalityId } from '../../shared/schemas/settings';
import { IconClose, IconNew } from './icons';

/**
 * Cabeçalho do balão, desenhado como o visor do personagem: vidro escuro, brilho ciano e os
 * dois olhos de pixel. Seletor rápido de personalidade, "Nova conversa" e fechar (SPEC §8.1).
 */

const PERSONALITY_ORDER: readonly PersonalityId[] = ['helpful', 'witty'];

interface HeaderProps {
  t: Translator;
  personality: PersonalityId;
  isDemo: boolean;
  /** Durante o onboarding só existe o botão de fechar. */
  showControls: boolean;
  canStartNew: boolean;
  onPersonality: (id: PersonalityId) => void;
  onNewConversation: () => void;
  onClose: () => void;
}

export function Header({
  t,
  personality,
  isDemo,
  showControls,
  canStartNew,
  onPersonality,
  onNewConversation,
  onClose
}: HeaderProps) {
  return (
    <header className="visor">
      <span className="visor__eyes" aria-hidden="true">
        <i />
        <i />
      </span>
      {/* Com os controles, os olhos do visor fazem o papel de marca e o nome fica só para leitores de tela. */}
      <h1 className={showControls ? 'visually-hidden' : 'visor__title'}>{t('balloon.title')}</h1>
      {isDemo && (
        <span className="badge-demo" title={t('balloon.demoBadge.hint')}>
          {t('balloon.demoBadge')}
          <span className="visually-hidden">: {t('balloon.demoBadge.hint')}</span>
        </span>
      )}
      <span className="visor__spacer" />
      {showControls && (
        <div className="segmented" role="radiogroup" aria-label={t('balloon.personality.label')}>
          {PERSONALITY_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              className="segmented__option"
              aria-checked={personality === id}
              tabIndex={personality === id ? 0 : -1}
              onClick={() => {
                onPersonality(id);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const next = PERSONALITY_ORDER.find((option) => option !== id) ?? id;
                onPersonality(next);
                const group = event.currentTarget.parentElement;
                group?.querySelector<HTMLButtonElement>(`[data-id="${next}"]`)?.focus();
              }}
              data-id={id}
            >
              {t(`personality.${id}.name`)}
            </button>
          ))}
        </div>
      )}
      {showControls && (
        <button
          type="button"
          className="icon-button icon-button--visor"
          title={t('balloon.newConversation')}
          aria-label={t('balloon.newConversation')}
          disabled={!canStartNew}
          onClick={onNewConversation}
        >
          <IconNew />
        </button>
      )}
      <button
        type="button"
        className="icon-button icon-button--visor"
        title={t('balloon.close')}
        aria-label={t('balloon.close')}
        onClick={onClose}
      >
        <IconClose />
      </button>
    </header>
  );
}
