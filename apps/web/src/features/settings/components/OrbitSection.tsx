// The Orbit automation settings section: the run hero, the connected-
// integration configuration gate, the daily-summary/schedule/template
// automation card, the last-run receipt (meter + counts), and the live
// artifact strip. All interlocked status/template/connector/run state lives
// in the feature-local `useWiredOrbit` hook; this component reads that
// controller and renders the exact markup the dialog mounts.
//
// Consumed by the SettingsDialog orchestrator through the slice barrel
// (ADR 0002).
import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '../../../i18n';
import { DEFAULT_ORBIT } from '../../../state/config';
import type { AppConfig } from '../../../types';
import { Icon } from '../../../components/Icon';
import { useWiredOrbit } from '../hooks/useOrbit.hooks';

export function OrbitSection({
  cfg,
  setCfg,
  composioApiKeyConfigured,
  daemonMediaProviders,
  daemonMediaProvidersFetchState,
  onOpenComposioSection,
  onLeaveForOrbitProject,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
  /** Whether the user has already saved a Composio API key. Drives the
   *  Orbit configuration gate's copy/CTA. When false the gate explains
   *  that Orbit needs Composio first; when true (key present, just no
   *  connectors yet) it nudges the user toward the connector catalog. */
  composioApiKeyConfigured: boolean;
  daemonMediaProviders?: AppConfig['mediaProviders'] | null;
  daemonMediaProvidersFetchState?: 'idle' | 'ok' | 'error';
  /** Switch the parent settings dialog to the Connectors (Composio) tab.
   *  Used by the Orbit gate's primary CTA so the user can fix the
   *  prerequisite without leaving the dialog. */
  onOpenComposioSection: () => void;
  /** Called right before navigating to the generated Orbit project so the
   *  parent dialog can persist any unsaved Orbit edits and close itself. */
  onLeaveForOrbitProject: (runConfig: AppConfig) => void;
}) {
  const { t } = useI18n();
  const {
    orbit,
    notice,
    copied,
    orbitTemplates,
    effectiveTemplateSkillId,
    selectedTemplate,
    lastRun,
    nextRunLabel,
    lastRunAbs,
    lastRunRel,
    liveArtifactHref,
    isBusy,
    meter,
    automationState,
    triggerLabel,
    showConfigGate,
    gateCopyKeys,
    runDisabled,
    runDisabledTitle,
    controlsLocked,
    controlsLockedHint,
    updateOrbit,
    triggerNow,
    copyMarkdown,
  } = useWiredOrbit({
    cfg,
    setCfg,
    composioApiKeyConfigured,
    daemonMediaProviders,
    daemonMediaProvidersFetchState,
    onLeaveForOrbitProject,
  });

  return (
    <section className="settings-section orbit-section">
      {/* ---------- 1. HEADER ZONE ---------- */}
      <header className="orbit-hero">
        <div className="orbit-hero-mark" aria-hidden="true">
          <Icon name="refresh" size={20} />
        </div>
        <div className="orbit-hero-copy">
          <span className="orbit-hero-eyebrow">{t('settings.orbit.eyebrow')}</span>
          <h3 className="orbit-hero-title">{t('settings.orbit.title')}</h3>
          <p className="orbit-hero-lede">
            {t('settings.orbit.lede')}
          </p>
        </div>
        <div className="orbit-hero-actions">
          <span
            className={`orbit-state-pill orbit-state-${automationState}`}
            title={
              orbit.enabled
                ? t('settings.orbit.statusOnTitle')
                : t('settings.orbit.statusOffTitle')
            }
          >
            <span className="orbit-state-dot" aria-hidden="true" />
            {orbit.enabled
              ? t('settings.orbit.statusActive')
              : t('settings.orbit.statusOff')}
          </span>
          <button
            type="button"
            className={'orbit-run-cta' + (isBusy ? ' is-busy' : '')}
            onClick={() => triggerNow()}
            disabled={runDisabled}
            title={runDisabledTitle}
          >
            {isBusy ? (
              <>
                <Icon name="spinner" size={14} className="icon-spin" />
                <span>{t('settings.orbit.running')}</span>
              </>
            ) : (
              <>
                <Icon name="play" size={14} />
                <span>{t('settings.orbit.runOpen')}</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ---------- 1b. CONFIGURATION GATE ----------
          Renders when no connected integrations are present. Orbit's job is
          to summarize connector activity, so without any wired-up
          connector there is literally nothing for it to report on.
          The gate uses the same orbit-themed accent surface as the
          automation card to feel like a first-class part of the panel
          rather than an inline error, and routes the user back to the
          Connectors tab inside the same settings dialog (no navigation
          off the page). The copy/CTA branch on whether a Composio API
          key has been saved already, because the prerequisite chain is:
          API key → connector connected → Orbit can run. */}
      {showConfigGate ? (
        <div
          className="orbit-config-gate"
          role="region"
          aria-label={t('settings.orbit.gateAriaLabel')}
          data-testid="orbit-config-gate"
        >
          <div className="orbit-config-gate-glyph" aria-hidden="true">
            <span className="orbit-config-gate-ring orbit-config-gate-ring-outer" />
            <span className="orbit-config-gate-ring orbit-config-gate-ring-inner" />
            <span className="orbit-config-gate-icon">
              <Icon name="link" size={16} />
            </span>
          </div>
          <div className="orbit-config-gate-copy">
            <span className="orbit-config-gate-eyebrow">
              {t('settings.orbit.gateEyebrow')}
            </span>
            <h4 className="orbit-config-gate-title">
              {t('settings.orbit.gateTitle')}
            </h4>
            <p className="orbit-config-gate-body">
              {t(gateCopyKeys.bodyKey)}
            </p>
          </div>
          <div className="orbit-config-gate-actions">
            <button
              type="button"
              className="orbit-config-gate-action"
              onClick={onOpenComposioSection}
              data-testid="orbit-config-gate-action"
            >
              <span>{t(gateCopyKeys.actionKey)}</span>
              <Icon name="chevron-right" size={13} />
            </button>
          </div>
        </div>
      ) : null}

      {/* ---------- 2. AUTOMATION CARD ----------
          Single unified configuration surface for Orbit: the daily-summary
          switch, the run-time schedule, and the prompt-template selection
          all live inside one card, separated by hairline dividers. The
          template row was previously a parallel card; folding it in here
          collapses the "two paired panels" pattern into one cohesive
          stack so users configure Orbit in one place. */}
      <div
        className={`orbit-automation${orbit.enabled ? ' is-on' : ''}${selectedTemplate ? ' has-template' : ''}${controlsLocked ? ' is-locked' : ''}`}
        aria-busy={orbitTemplates === null || undefined}
        aria-disabled={controlsLocked || undefined}
        data-testid="orbit-automation-card"
      >
        {controlsLocked ? (
          <div
            className="orbit-automation-lock-banner"
            role="note"
            aria-label={t('settings.orbit.controlsLockedHint')}
          >
            <Icon name="link" size={12} />
            <span className="orbit-automation-lock-badge">
              {t('settings.orbit.controlsLockedBadge')}
            </span>
            <span className="orbit-automation-lock-text">
              {t('settings.orbit.controlsLockedHint')}
            </span>
          </div>
        ) : null}
        <div className="orbit-automation-row orbit-automation-switch-row">
          <div className="orbit-automation-label">
            <span className="orbit-automation-title">{t('settings.orbit.dailySummaryTitle')}</span>
            <span className="orbit-automation-sub">
              {t('settings.orbit.dailySummarySub')}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={orbit.enabled}
            aria-disabled={controlsLocked || undefined}
            className={`orbit-switch${orbit.enabled ? ' is-on' : ''}${controlsLocked ? ' is-locked' : ''}`}
            disabled={controlsLocked}
            title={controlsLockedHint}
            onClick={() => updateOrbit({ enabled: !orbit.enabled })}
          >
            <span className="orbit-switch-track" aria-hidden="true">
              <span className="orbit-switch-thumb" />
            </span>
            <span className="orbit-switch-text">
              {orbit.enabled ? t('settings.orbit.on') : t('settings.orbit.off')}
            </span>
          </button>
        </div>

        <div className="orbit-automation-divider" aria-hidden="true" />

        <div className="orbit-automation-row orbit-automation-schedule-row">
          <div className="orbit-automation-label">
            <span className="orbit-automation-title">{t('settings.orbit.runTimeTitle')}</span>
            <span className="orbit-automation-sub">
              {t('settings.orbit.runTimeSub')}
            </span>
          </div>
          <div className="orbit-automation-schedule-controls">
            <input
              type="time"
              className="orbit-time-input"
              value={orbit.time}
              onChange={(e) => updateOrbit({ time: e.target.value || DEFAULT_ORBIT.time })}
              aria-label={t('settings.orbit.runTimeAria')}
              aria-disabled={controlsLocked || undefined}
              disabled={controlsLocked}
              title={controlsLockedHint}
            />
            <div className="orbit-next-run" aria-live="polite">
              {orbit.enabled ? (
                nextRunLabel ? (
                  <>
                    <span className="orbit-next-run-label">{t('settings.orbit.nextRun')}</span>
                    <span className="orbit-next-run-value">{nextRunLabel}</span>
                  </>
                ) : (
                  <>
                    <span className="orbit-next-run-label">{t('settings.orbit.nextRun')}</span>
                    <span className="orbit-next-run-value muted">{t('settings.orbit.nextRunScheduledAfterSave')}</span>
                  </>
                )
              ) : (
                <>
                  <span className="orbit-next-run-label">{t('settings.orbit.schedule')}</span>
                  <span className="orbit-next-run-value muted">{t('settings.orbit.pausedManualOnly')}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="orbit-automation-divider" aria-hidden="true" />

        {/* Prompt template row — folded into the automation card so users
            configure schedule and prompt steering in one place. The select
            picks which scenario === 'orbit' skill template gets injected
            into the Orbit prompt. There is no separate preview slab below
            the select: the dropdown's option label is the source of
            truth for the active template, and each option carries the
            skill description as a `title` tooltip. The only state that
            still needs explicit surfacing is "saved id no longer in the
            registry" — that warning replaces the row's normal sub-copy
            and inlines a Reset action when the missing id differs from
            the default. */}
        <div className="orbit-automation-row orbit-automation-template-row">
          <div className="orbit-automation-label">
            {/* Title aligns with the other automation rows ("Daily summary",
                "Run time") — a single short label. */}
            <span className="orbit-automation-title">{t('settings.orbit.templateTitle')}</span>
            {orbitTemplates &&
            effectiveTemplateSkillId &&
            !orbitTemplates.some((s) => s.id === effectiveTemplateSkillId) ? (
              // The saved skill id is no longer installed — surface a
              // soft warning right under the title, with an inline Reset
              // action that pushes back to DEFAULT_ORBIT (currently
              // `orbit-general`). Reset is hidden when the missing id
              // already equals the default, so the control never loops
              // on itself.
              <span
                className="orbit-automation-sub orbit-automation-sub-warning"
                role="status"
              >
                <Icon name="history" size={11} />
                <span>
                  {t('settings.orbit.templateMissing', { id: effectiveTemplateSkillId })}{' '}
                  {orbitTemplates.length === 0
                    ? t('settings.orbit.templateMissingInstall')
                    : t('settings.orbit.templateMissingPickAnother')}
                </span>
                {DEFAULT_ORBIT.templateSkillId &&
                effectiveTemplateSkillId !== DEFAULT_ORBIT.templateSkillId ? (
                  <button
                    type="button"
                    className="orbit-automation-sub-action"
                    disabled={controlsLocked}
                    aria-disabled={controlsLocked || undefined}
                    onClick={() =>
                      updateOrbit({ templateSkillId: DEFAULT_ORBIT.templateSkillId })
                    }
                    title={
                      controlsLocked
                        ? t('settings.orbit.controlsLockedHint')
                        : t('settings.orbit.templateResetTitle', {
                            id: DEFAULT_ORBIT.templateSkillId,
                          })
                    }
                  >
                    {t('settings.orbit.templateReset')}
                  </button>
                ) : null}
              </span>
            ) : (
              <span className="orbit-automation-sub">
                {t('settings.orbit.templateHelp')}
              </span>
            )}
          </div>
          <div className="orbit-automation-template-controls">
            <div className="orbit-template-select">
              <div className="orbit-template-select-wrap">
                <select
                  id="orbit-template-select"
                  className="orbit-template-select-input"
                  aria-label={t('settings.orbit.templateAria')}
                  aria-disabled={controlsLocked || undefined}
                  value={effectiveTemplateSkillId}
                  disabled={orbitTemplates === null || controlsLocked}
                  title={controlsLockedHint}
                  onChange={(e) => {
                    const next = e.target.value;
                    // Guard against the loading placeholder making it
                    // through onChange — only persist real skill ids.
                    if (!next) return;
                    updateOrbit({ templateSkillId: next });
                  }}
                >
                  {/* While the skill registry is still loading we render a
                      single non-interactive placeholder so the select has
                      a value to display. Once `orbitTemplates` resolves we
                      drop the placeholder entirely — the dropdown lists
                      only real Orbit skill templates, so there is no
                      "no template" / "use built-in" option to pick. */}
                  {orbitTemplates === null ? (
                    <option value="">{t('settings.orbit.templatesLoading')}</option>
                  ) : null}
                  {/* If the saved id no longer exists in the registry,
                      surface it as a hidden placeholder so the controlled
                      <select> doesn't fall back to the first real option
                      and silently mutate the user's stored choice. The
                      inline warning above offers the explicit Reset
                      action. */}
                  {orbitTemplates &&
                  effectiveTemplateSkillId &&
                  !orbitTemplates.some((s) => s.id === effectiveTemplateSkillId) ? (
                    <option value={effectiveTemplateSkillId} hidden>
                      {t('settings.orbit.templateMissingOption', {
                        id: effectiveTemplateSkillId,
                      })}
                    </option>
                  ) : null}
                  {orbitTemplates && orbitTemplates.length > 0 ? (
                    <optgroup label={t('settings.orbit.templatesOptgroup')}>
                      {orbitTemplates.map((s) => (
                        <option
                          key={s.id}
                          value={s.id}
                          // Browser-native tooltip — surfaces the skill
                          // description on hover without needing a
                          // dedicated preview panel.
                          title={s.description ?? undefined}
                        >
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
                <Icon
                  name="chevron-down"
                  size={12}
                  className="orbit-template-select-chevron"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- 4. RUN RESULT / RECEIPT ---------- */}
      {/* When there is no last run yet, the "receipt" metaphor doesn't fit —
          there's nothing to report. We swap to a first-run prompt with its
          own composed layout (orbit-glyph · copy · inline CTA) so the empty
          state feels intentional and rhythmically balanced with the hero,
          automation card, and (eventual) artifact strip. */}
      {lastRun ? (
        <div className="orbit-receipt">
          <div className="orbit-receipt-head">
            <div className="orbit-receipt-head-left">
              <span className="orbit-receipt-eyebrow">
                <Icon name="history" size={12} />
                {t('settings.orbit.lastRun')}
              </span>
              <span
                className="orbit-receipt-timestamp"
                title={lastRunAbs ?? undefined}
              >
                {lastRunRel ?? lastRunAbs}
              </span>
            </div>
            <span
              className={`orbit-trigger-pill orbit-trigger-${lastRun.trigger ?? 'scheduled'}`}
            >
              {triggerLabel}
            </span>
          </div>

          {notice ? (
            <div
              className={`orbit-inline-notice is-${notice.kind}`}
              role={notice.kind === 'error' ? 'alert' : 'status'}
            >
              <Icon name={notice.kind === 'error' ? 'close' : 'check'} size={12} />
              <span>{notice.message}</span>
            </div>
          ) : null}

          <div
            className="orbit-meter"
            role="img"
            aria-label={t('settings.orbit.meterAria', {
              succeeded: lastRun.connectorsSucceeded,
              skipped: lastRun.connectorsSkipped,
              failed: lastRun.connectorsFailed,
              checked: lastRun.connectorsChecked,
            })}
          >
            {meter.succeeded > 0 ? (
              <span
                className="orbit-meter-seg is-succeeded"
                style={{ width: `${meter.succeeded}%` }}
              />
            ) : null}
            {meter.skipped > 0 ? (
              <span
                className="orbit-meter-seg is-skipped"
                style={{ width: `${meter.skipped}%` }}
              />
            ) : null}
            {meter.failed > 0 ? (
              <span
                className="orbit-meter-seg is-failed"
                style={{ width: `${meter.failed}%` }}
              />
            ) : null}
            {meter.succeeded + meter.skipped + meter.failed === 0 ? (
              <span className="orbit-meter-seg is-empty" />
            ) : null}
          </div>
          <dl className="orbit-counts">
            <div className="orbit-count">
              <dt>{t('settings.orbit.countChecked')}</dt>
              <dd>{lastRun.connectorsChecked}</dd>
            </div>
            <div className="orbit-count is-succeeded">
              <dt>{t('settings.orbit.countSucceeded')}</dt>
              <dd>{lastRun.connectorsSucceeded}</dd>
            </div>
            <div className="orbit-count is-skipped">
              <dt>{t('settings.orbit.countSkipped')}</dt>
              <dd>{lastRun.connectorsSkipped}</dd>
            </div>
            <div className="orbit-count is-failed">
              <dt>{t('settings.orbit.countFailed')}</dt>
              <dd>{lastRun.connectorsFailed}</dd>
            </div>
          </dl>
        </div>
      ) : notice ? (
        <div
          className={`orbit-inline-notice is-${notice.kind}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          <Icon name={notice.kind === 'error' ? 'close' : 'check'} size={12} />
          <span>{notice.message}</span>
        </div>
      ) : null}

      {/* ---------- 5. LIVE ARTIFACT STRIP ---------- */}
      {lastRun ? (
        <div
          className={`orbit-artifact-strip${liveArtifactHref ? '' : ' is-legacy'}`}
        >
          <div className="orbit-artifact-strip-icon" aria-hidden="true">
            <Icon name="file-code" size={18} />
          </div>
          <div className="orbit-artifact-strip-copy">
            <span className="orbit-artifact-strip-kicker">
              {liveArtifactHref
                ? t('settings.orbit.artifactKickerLive')
                : t('settings.orbit.artifactKickerLegacy')}
            </span>
            <span className="orbit-artifact-strip-title">
              {t('settings.orbit.artifactTitle')}
            </span>
            <span className="orbit-artifact-strip-meta">
              {liveArtifactHref
                ? t('settings.orbit.artifactMetaLive')
                : t('settings.orbit.artifactMetaLegacy')}
            </span>
          </div>
          <div className="orbit-artifact-strip-actions">
            {lastRun.markdown ? (
              <button
                type="button"
                className="orbit-artifact-ghost"
                onClick={() => void copyMarkdown()}
                title={t('settings.orbit.copyMarkdownTitle')}
              >
                {copied ? (
                  <>
                    <Icon name="check" size={13} />
                    <span>{t('settings.orbit.copied')}</span>
                  </>
                ) : (
                  <>
                    <Icon name="copy" size={13} />
                    <span>{t('settings.orbit.copy')}</span>
                  </>
                )}
              </button>
            ) : null}
            {liveArtifactHref ? (
              <a
                className="orbit-artifact-open"
                href={liveArtifactHref}
                target="_blank"
                rel="noreferrer"
              >
                <span>{t('settings.orbit.openArtifact')}</span>
                <Icon name="external-link" size={13} />
              </a>
            ) : null}
          </div>
          {lastRun.markdown ? (
            <details className="orbit-artifact-peek">
              <summary>
                <Icon name="chevron-right" size={12} />
                <span>{t('settings.orbit.sourceMarkdown')}</span>
              </summary>
              <pre>{lastRun.markdown}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
