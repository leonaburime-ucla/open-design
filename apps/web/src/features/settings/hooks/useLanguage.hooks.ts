// Feature-local hook for the Language settings section: the locale picker
// grid. `locale`/`setLocale` are app-wide state already owned by
// `useI18n()`'s `I18nProvider` (not local `useState`), so this hook's only
// job is to layer the section's analytics tracking onto the picker action —
// mirroring how `AppearanceSection`'s hook wraps `cfg`/`setCfg`.
import { useAnalytics } from '../../../analytics/provider';
import { trackSettingsLanguageClick } from '../../../analytics/events';
import { useI18n } from '../../../i18n';
import type { Locale } from '../../../i18n';

/** Everything the Language section JSX reads off the controller. */
export interface LanguageController {
  locale: Locale;
  selectLocale: (code: Locale) => void;
}

export function useLanguage(): LanguageController {
  const { locale, setLocale } = useI18n();
  const analytics = useAnalytics();

  const selectLocale = (code: Locale) => {
    // P1 ui_click area=language — record the locale id that was picked,
    // regardless of whether it differs from the current one (user clicked
    // = signal).
    trackSettingsLanguageClick(analytics.track, {
      page_name: 'settings',
      area: 'language',
      element: code,
    });
    setLocale(code);
  };

  return { locale, selectLocale };
}
