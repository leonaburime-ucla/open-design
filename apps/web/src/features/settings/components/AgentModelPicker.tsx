// Dumb component for one Local CLI agent card's model/reasoning picker.
// Props in, JSX out — the owning cluster (`useAgentTesting`) holds the
// `agentCustomModelIds` set and the `cfg.agentModels` mutation logic; this
// component only renders the field and forwards raw picker events.
import { useI18n } from '../../../i18n';
import { Icon } from '../../../components/Icon';
import { CUSTOM_MODEL_SENTINEL, SearchableModelSelect } from '../../../components/modelOptions';
import { shouldShowCustomModelInput } from '../rules';
import type { AgentInfo, AgentModelChoice } from '../../../types';

interface Props {
  agent: AgentInfo;
  choice: AgentModelChoice | undefined;
  /** Whether the AMR account is currently signed in — while true and AMR's
   *  live model catalog hasn't landed yet, the field shows a loading state
   *  instead of hiding (the catalog fills in a beat after sign-in). */
  amrLoggedIn: boolean;
  isCustomModel: boolean;
  onSelectModel: (nextValue: string) => void;
  onCustomModelTextChange: (value: string) => void;
  onSelectReasoning: (value: string) => void;
}

export function AgentModelPicker({
  agent: selected,
  choice,
  amrLoggedIn,
  isCustomModel,
  onSelectModel,
  onCustomModelTextChange,
  onSelectReasoning,
}: Props) {
  const { t } = useI18n();
  const hasModels = Array.isArray(selected.models) && selected.models.length > 0;
  const hasReasoning =
    Array.isArray(selected.reasoningOptions) && selected.reasoningOptions.length > 0;

  // AMR's live catalog only lands a beat after sign-in. While the user is
  // signed in but the model list hasn't arrived yet, show the picker in a
  // loading state instead of hiding it — so the dropdown appears at sign-in
  // and simply fills in, rather than popping in seconds later.
  if (selected.id === 'amr' && !hasModels && amrLoggedIn) {
    return (
      <div className="agent-card-config">
        <label className="field">
          <span className="field-label">
            {t('settings.modelPicker')}
            <span className="agent-model-source-badge live" aria-hidden="true">
              {t('settings.modelSourceLive')}
            </span>
          </span>
          <div className="agent-model-select-wrap">
            <div
              className="settings-model-select agent-model-select-loading"
              role="status"
              aria-busy="true"
              data-testid={`settings-agent-model-loading-${selected.id}`}
            >
              <Icon name="spinner" size={13} className="icon-spin" />
              <span>{t('common.loading')}</span>
            </div>
          </div>
        </label>
        <p className="hint agent-model-row-hint">{t('settings.modelPickerLiveHint')}</p>
      </div>
    );
  }
  if (!hasModels && !hasReasoning) return null;

  const knownModelIds = selected.models?.map((m) => m.id) ?? [];
  // Adapters opt out via `supportsCustomModel: false` on their
  // RuntimeAgentDef when their CLI has no `--model` flag (Antigravity,
  // upstream issue #35) or when free-text ids silently fail at spawn
  // (AMR routes through ACP `session/set_model` and validates against a
  // live catalog). Undefined === allow, matching today's UX.
  const allowCustomModel = selected.supportsCustomModel !== false;
  const configuredModel =
    typeof choice?.model === 'string' && choice.model ? choice.model : null;
  const modelValue =
    selected.id === 'amr' && configuredModel && !knownModelIds.includes(configuredModel)
      ? selected.models?.[0]?.id ?? ''
      : configuredModel ?? selected.models?.[0]?.id ?? '';
  const reasoningValue = choice?.reasoning ?? selected.reasoningOptions?.[0]?.id ?? '';
  const customActive =
    allowCustomModel && hasModels && shouldShowCustomModelInput(modelValue, knownModelIds, isCustomModel);
  const selectValue = customActive ? CUSTOM_MODEL_SENTINEL : modelValue;
  const modelSource = selected.modelsSource ?? 'fallback';
  const modelSourceLabel =
    modelSource === 'live' ? t('settings.modelSourceLive') : t('settings.modelSourceFallback');
  const modelSourceHint =
    modelSource === 'live'
      ? selected.supportsCustomModel === false
        ? t('settings.modelPickerLiveCatalogOnlyHint')
        : t('settings.modelPickerLiveHint')
      : t('settings.modelPickerFallbackHint');

  return (
    <div className="agent-card-config">
      {hasModels ? (
        <>
          <label className="field">
            <span className="field-label">
              {t('settings.modelPicker')}
              <span className={`agent-model-source-badge ${modelSource}`} aria-hidden="true">
                {modelSourceLabel}
              </span>
            </span>
            <div className="agent-model-select-wrap">
              <SearchableModelSelect
                className="inline-switcher__select settings-model-select"
                value={selectValue}
                aria-label={t('settings.modelPicker')}
                searchPlaceholder={t('designs.searchPlaceholder')}
                searchInputTestId={`settings-agent-model-search-${selected.id}`}
                popoverTestId={`settings-agent-model-popover-${selected.id}`}
                minSearchableOptions={5}
                popoverMinWidth={340}
                models={selected.models!}
                onChange={onSelectModel}
                additionalOptions={
                  allowCustomModel
                    ? [{ value: CUSTOM_MODEL_SENTINEL, label: t('settings.modelCustom') }]
                    : undefined
                }
              />
            </div>
          </label>
          <p className="hint agent-model-row-hint">{modelSourceHint}</p>
        </>
      ) : null}
      {customActive ? (
        <label className="field">
          <span className="field-label">{t('settings.modelCustomLabel')}</span>
          <input
            type="text"
            value={modelValue}
            placeholder={t('settings.modelCustomPlaceholder')}
            onChange={(e) => onCustomModelTextChange(e.target.value)}
          />
        </label>
      ) : null}
      {hasReasoning ? (
        <label className="field">
          <span className="field-label">{t('settings.reasoningPicker')}</span>
          <div className="agent-model-select-wrap">
            <select value={reasoningValue} onChange={(e) => onSelectReasoning(e.target.value)}>
              {selected.reasoningOptions!.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <Icon name="chevron-down" size={12} className="agent-model-select-chevron" />
          </div>
        </label>
      ) : null}
    </div>
  );
}
