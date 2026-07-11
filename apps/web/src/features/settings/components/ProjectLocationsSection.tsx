// Project Locations settings section: the built-in default location card,
// the editable list of external project folders, and the add-folder /
// remove / default-selection controls. State + the fetch/save/scan actions
// live in the feature-local `useProjectLocations` hook; this component
// renders the exact markup the dialog mounts.
//
// Consumed by the SettingsDialog orchestrator through the slice barrel
// (ADR 0002).
import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '../../../i18n';
import { Icon } from '../../../components/Icon';
import type { AppConfig } from '../../../types';
import { useWiredProjectLocations } from '../hooks/useProjectLocations.hooks';
import { locationLabel } from '../rules';

interface Props {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
  onProjectsRefresh?: () => Promise<void> | void;
}

export function ProjectLocationsSection({ cfg, setCfg, onProjectsRefresh }: Props) {
  const { t } = useI18n();
  const {
    builtIn,
    effectiveDefaultLocationId,
    drafts,
    loading,
    saving,
    status,
    error,
    defaultControlLabel,
    handleDefaultLocationChange,
    handleAddFolder,
    removeDraft,
  } = useWiredProjectLocations({ cfg, setCfg, onProjectsRefresh });

  return (
    <section className="settings-section settings-section-card project-locations-section">
      <div className="section-head">
        <div>
          <h3>{t('settings.projectLocations')}</h3>
          <p className="hint">{t('settings.projectLocationsDescription')}</p>
        </div>
      </div>

      {builtIn ? (
        <div className={`project-location-card is-built-in${effectiveDefaultLocationId === builtIn.id ? ' is-default' : ''}`}>
          <div>
            <strong>{t('newproj.locationDefault')}</strong>
            <code>{builtIn.path}</code>
          </div>
          <label className="project-location-default-control">
            <input
              type="radio"
              name="project-location-default"
              checked={effectiveDefaultLocationId === builtIn.id}
              onChange={() => handleDefaultLocationChange(builtIn.id)}
            />
            <span>{defaultControlLabel(builtIn.id)}</span>
          </label>
        </div>
      ) : null}

      <div className="project-location-list">
        {drafts.map((draft, index) => (
          <div
            className={`project-location-edit${draft.id && effectiveDefaultLocationId === draft.id ? ' is-default' : ''}`}
            key={`${draft.id ?? 'new'}-${index}`}
          >
            <div className="project-location-edit-main">
              <strong>{locationLabel(draft.path)}</strong>
              <code>{draft.path}</code>
              <small>{t('settings.projectLocationsWorkBaseMeta')}</small>
            </div>
            {draft.id ? (
              <label className="project-location-default-control">
                <input
                  type="radio"
                  name="project-location-default"
                  checked={effectiveDefaultLocationId === draft.id}
                  onChange={() => handleDefaultLocationChange(draft.id!)}
                />
                <span>{defaultControlLabel(draft.id)}</span>
              </label>
            ) : null}
            <button type="button" className="icon-btn danger" onClick={() => removeDraft(index)} disabled={saving}>
              {t('common.delete')}
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="icon-btn project-location-add"
        onClick={handleAddFolder}
        disabled={loading || saving}
      >
        <Icon name="plus" size={12} />
        {t('settings.projectLocationsAddFolder')}
      </button>

      {status ? <p className="settings-rescan-status">{status}</p> : null}
      {error ? <p className="settings-rescan-status error">{error}</p> : null}
    </section>
  );
}
