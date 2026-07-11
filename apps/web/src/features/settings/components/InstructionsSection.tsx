// The custom-instructions settings section: a single free-text field.
// State lives in the feature-local `useInstructions` hook; this component
// renders the exact markup the dialog mounts.
//
// Consumed by the SettingsDialog orchestrator through the slice barrel
// (ADR 0002).
import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '../../../i18n';
import type { AppConfig } from '../../../types';
import { useInstructions } from '../hooks/useInstructions.hooks';

export function InstructionsSection({
  cfg,
  setCfg,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}) {
  const { t } = useI18n();
  const { customInstructions, setCustomInstructions } = useInstructions({ cfg, setCfg });

  return (
    <section className="settings-section settings-section-card instructions-rules-section">
      <div className="memory-field-block instructions-rules-card">
        <div className="memory-block-head">
          <div>
            <h4>{t('settings.customInstructionsTitle')}</h4>
            <p className="hint">
              {t('settings.customInstructionsDesc')}
            </p>
          </div>
        </div>
        <textarea
          className="custom-instructions-input memory-global-rules-input instructions-rules-input"
          rows={5}
          maxLength={5000}
          placeholder={t('settings.customInstructionsPlaceholder')}
          value={customInstructions}
          onChange={(event) => setCustomInstructions(event.target.value)}
        />
      </div>
    </section>
  );
}
