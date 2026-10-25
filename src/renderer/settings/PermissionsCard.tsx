import { useEffect, useState } from 'react';
import type { Translator } from '../../shared/i18n';
import { PERMISSION_LABEL_KEYS, TOOL_LABEL_KEYS } from '../../shared/tools/labels';
import type { PermissionGrantView } from '../../shared/tools/types';
import { Card } from './fields';

/**
 * Privacidade › Permissões (SPEC §12, §22.2): o que as ferramentas podem fazer sem perguntar
 * de novo ("nesta sessão" e "sempre"), cada uma com Revogar. Ações destrutivas nunca aparecem
 * aqui, porque são confirmadas toda vez.
 */
export function PermissionsCard({ t }: { t: Translator }) {
  const [grants, setGrants] = useState<PermissionGrantView[] | null>(null);
  const [revoked, setRevoked] = useState(false);

  useEffect(() => {
    let active = true;
    const load = (): void => {
      void window.clipster.permissions.list().then((result) => {
        if (active && result.ok) setGrants(result.data);
      });
    };
    load();
    const unsubscribe = window.clipster.permissions.onChange(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const dateFormat = new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
    dateStyle: 'short',
    timeStyle: 'short'
  });

  return (
    <Card>
      <div className="field field--column">
        <h2 className="subsection-title subsection-title--first">
          {t('settings.privacy.permissions')}
        </h2>
        <p className="field__hint">{t('settings.privacy.permissions.hint')}</p>
        {grants !== null && grants.length === 0 && (
          <p className="prose" data-testid="permissions-empty">
            {t('settings.privacy.permissions.empty')}
          </p>
        )}
        {grants !== null && grants.length > 0 && (
          <ul className="grants" data-testid="permissions-list">
            {grants.map((grant) => (
              <li key={grant.id} className="grant" data-tool={grant.tool} data-scope={grant.scope}>
                <div className="grant__text">
                  <span className="field__label">{t(TOOL_LABEL_KEYS[grant.tool])}</span>
                  <span className="field__hint">
                    {t('settings.privacy.permissions.detail', {
                      permissions: grant.permissions
                        .map((id) => t(PERMISSION_LABEL_KEYS[id]))
                        .join(', '),
                      scope: t(
                        grant.scope === 'always'
                          ? 'settings.privacy.permissions.always'
                          : 'settings.privacy.permissions.session'
                      ),
                      date: dateFormat.format(new Date(grant.grantedAt))
                    })}
                  </span>
                </div>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    void window.clipster.permissions.revoke(grant.id).then((result) => {
                      if (result.ok && result.data.revoked) {
                        setRevoked(true);
                        setGrants((current) =>
                          current === null ? null : current.filter((item) => item.id !== grant.id)
                        );
                      }
                    });
                  }}
                >
                  {t('settings.privacy.permissions.revoke')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {revoked && (
          <p className="field__hint" role="status">
            {t('settings.privacy.permissions.revoked')}
          </p>
        )}
      </div>
    </Card>
  );
}
