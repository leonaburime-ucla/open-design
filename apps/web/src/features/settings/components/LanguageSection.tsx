// The Language settings section: the locale picker grid. Locale state and
// the picker's analytics tracking live in the feature-local `useLanguage`
// hook; this component renders the exact markup the dialog mounts.
//
// Consumed by the SettingsDialog orchestrator through the slice barrel
// (ADR 0002).
import { useI18n } from '../../../i18n';
import { LOCALE_LABEL, LOCALES } from '../../../i18n/types';
import { Icon } from '../../../components/Icon';
import { useLanguage } from '../hooks/useLanguage.hooks';

export function LanguageSection() {
  const { t } = useI18n();
  const { locale, selectLocale } = useLanguage();

  return (
    <section className="settings-section">
      <div className="settings-language-grid" role="radiogroup" aria-label={t('settings.language')}>
        {LOCALES.map((code) => {
          const active = locale === code;
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={active}
              className={`settings-language-tile${active ? ' active' : ''}`}
              onClick={() => selectLocale(code)}
            >
              <span className="settings-language-tile-text">
                <span className="settings-language-tile-title">
                  {LOCALE_LABEL[code]}
                </span>
                <span className="settings-language-tile-code">
                  {code}
                </span>
              </span>
              {active ? <Icon name="check" size={16} /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
