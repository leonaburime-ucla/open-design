// The Appearance settings section: the theme (system/light/dark) segmented
// control and the accent-color swatch picker. Theme/accent state and the
// live-preview document effect live in the feature-local `useAppearance`
// hook; this component wraps each action with its analytics tracking call
// (mirroring `MediaProvidersSection`/`NotificationsSection`) and renders the
// exact markup the dialog mounts.
//
// Consumed by the SettingsDialog orchestrator through the slice barrel
// (ADR 0002).
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { useAnalytics } from '../../../analytics/provider';
import { trackSettingsAppearanceClick } from '../../../analytics/events';
import { useI18n } from '../../../i18n';
import { Icon } from '../../../components/Icon';
import { ACCENT_SWATCHES, DEFAULT_ACCENT_COLOR } from '../../../state/appearance';
import type { AppConfig, AppTheme } from '../../../types';
import { useAppearance } from '../hooks/useAppearance.hooks';

const THEMES: Array<{ value: AppTheme; labelKey: 'settings.themeSystem' | 'settings.themeLight' | 'settings.themeDark'; icon?: 'sun' | 'moon' }> = [
  { value: 'system', labelKey: 'settings.themeSystem' },
  { value: 'light', labelKey: 'settings.themeLight', icon: 'sun' },
  { value: 'dark', labelKey: 'settings.themeDark', icon: 'moon' },
];

export function AppearanceSection({
  cfg,
  setCfg,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}) {
  const { t } = useI18n();
  const analytics = useAnalytics();
  const { theme, accentColor, setTheme, setAccentColor } = useAppearance({ cfg, setCfg });
  const accentLabel = t('pet.fieldAccent');
  const defaultAccentLabel = t('pet.fieldAccentDefault');
  const customAccentLabel = t('pet.fieldAccentCustom');

  return (
    <section className="settings-section">
      <div className="seg-control" role="group" aria-label={t('settings.appearance')} style={{ '--seg-cols': THEMES.length } as CSSProperties}>
        {THEMES.map(({ value, labelKey, icon }) => (
          <button
            key={value}
            type="button"
            className={'seg-btn' + (theme === value ? ' active' : '')}
            aria-pressed={theme === value}
            onClick={() => {
              // P1 ui_click area=appearance — `system|light|dark` only
              // emits from the segmented control; accent swatch picks
              // use `accent_color` with the swatch hex below.
              if (value === 'system' || value === 'light' || value === 'dark') {
                trackSettingsAppearanceClick(analytics.track, {
                  page_name: 'settings',
                  area: 'appearance',
                  element: value,
                });
              }
              setTheme(value);
            }}
          >
            {icon ? <Icon name={icon} size={14} aria-hidden="true" /> : null}
            <span className="seg-title">{t(labelKey)}</span>
          </button>
        ))}
      </div>
      <div className="field">
        <span className="field-label">{accentLabel}</span>
        <div className="pet-swatches" role="radiogroup" aria-label={accentLabel}>
          {ACCENT_SWATCHES.map((color) => {
            const active = accentColor === color;
            return (
              <button
                key={color}
                type="button"
                className={`pet-swatch${active ? ' active' : ''}`}
                style={{ background: color }}
                aria-label={color === DEFAULT_ACCENT_COLOR ? defaultAccentLabel : color}
                aria-checked={active}
                role="radio"
                onClick={() => {
                  trackSettingsAppearanceClick(analytics.track, {
                    page_name: 'settings',
                    area: 'appearance',
                    element: 'accent_color',
                    color,
                  });
                  setAccentColor(color);
                }}
              />
            );
          })}
          <input
            type="color"
            aria-label={customAccentLabel}
            className="pet-swatch-picker"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
