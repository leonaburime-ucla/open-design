// The execution-mode section's Local CLI panel: the installed/unavailable
// agent grid, the per-agent connection test, the AMR sign-in/wallet card,
// the per-agent model/reasoning picker, the inline memory-model override, and
// the per-agent CLI env var disclosure. All owned state (rescan, test,
// custom-model-id set) lives in `useDaemonAgents`; the hover-highlight state
// (shared with the AMR account cluster's card) and the AMR account/highlight
// controllers are injected separately since they are shared with the AMR
// agent card elsewhere in the execution-mode section.
// Props in, JSX out (ADR 0002).
import type { Dispatch, SetStateAction } from 'react';
import { VisuallyHidden } from '@open-design/components';
import { useI18n } from '../../../i18n';
import type { Locale } from '../../../i18n';
import { AgentIcon } from '../../../components/AgentIcon';
import { AgentDiagnosticRow } from '../../../components/AgentDiagnosticRow';
import { AmrLoginPill } from '../../../components/AmrLoginPill';
import { PlanBadge } from '../../../components/PlanBadge';
import { Icon } from '../../../components/Icon';
import { MemoryModelInline } from '../../../components/MemoryModelInline';
import { amrProfileBadgeLabel } from '../../../runtime/amr-guidance';
import type { AgentInfo, ApiProtocol, AppConfig } from '../../../types';
import { AGENT_CLI_ENV_FIELDS, AGENT_SHORT_DESCRIPTIONS } from '../constants';
import {
  agentModelSummary,
  amrWalletValueLabel,
  cleanAgentVersionLabel,
  codexPathRepairState,
  codexPathStrings,
  displayAgentName,
  formatAmrWalletBalance,
  formatConnectionTestMessage,
  sanitizeHttpsUrl,
  testStatusVariant,
  updateAgentCliEnvValue,
} from '../rules';
import type { AmrAccountController } from '../hooks/useAmrAccount.hooks';
import type { AmrHighlightController } from '../hooks/useAmrHighlight.hooks';
import type { DaemonAgentsController } from '../hooks/useDaemonAgents.hooks';
import { AgentModelPicker } from './AgentModelPicker';

interface Props {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
  agents: readonly AgentInfo[];
  apiProtocol: ApiProtocol;
  locale: Locale;
  amrAccount: AmrAccountController;
  amrHighlight: AmrHighlightController;
  daemonAgents: DaemonAgentsController;
  /** The AMR agent card's hover state — owned by the orchestrator (shared
   *  with `useWiredAmrAccount`'s `onAmrAgentUnavailable` cleanup), not by
   *  `useDaemonAgents`. */
  hoveredAgentCardId: string | null;
  setHoveredAgentCardId: (id: string | null) => void;
}

export function LocalCliSection({
  cfg,
  setCfg,
  agents,
  apiProtocol,
  locale,
  amrAccount,
  amrHighlight,
  daemonAgents,
  hoveredAgentCardId,
  setHoveredAgentCardId,
}: Props) {
  const { t } = useI18n();
  const {
    amrCardStatus,
    setAmrCardStatus,
    amrCardStatusReady,
    amrWalletSnapshot,
    amrWalletReady,
  } = amrAccount;
  const { amrCardRef, amrHighlightActive, amrCoachmarkArmed, amrCoachmarkDismissed, dismissCoachmark } =
    amrHighlight;
  const {
    installedAgents,
    unavailableAgents,
    initialAgentScanRunning,
    agentRescanRunning,
    agentRescanNotice,
    handleRefreshAgents,
    markAgentInstallIntent,
    agentTestState,
    handleTestAgent,
    agentCustomModelIds,
    attributedAmrSettingsUrl,
    diagnosticHandlersForAgent,
    selectAgent,
    openAmrUpgrade,
    canUpgradeVelaPlan,
    formatVelaBalanceUsd,
    applyCodexDetectedPath,
    clearCodexCustomPath,
    onAgentModelChange,
    onAgentModelCustomTextChange,
    onAgentReasoningChange,
  } = daemonAgents;

  const selectedAgent = agents.find((a) => a.id === cfg.agentId && a.available);

  return (
    <section className="settings-section">
      <div className="section-head">
        <div>
          <p className="hint">{t('settings.codeAgentHint')}</p>
        </div>
      </div>
      {initialAgentScanRunning ? (
        <div className="agent-scan-card" role="status" aria-live="polite">
          <div className="agent-scan-card__stage">
            <span className="agent-scan-card__ring" aria-hidden />
            <strong>{t('settings.rescanRunning')}</strong>
            <span>{t('settings.codeAgentHint')}</span>
            <div className="agent-scan-card__progress" aria-hidden>
              <span />
            </div>
          </div>
          <div className="agent-scan-card__rows" aria-hidden>
            <span><i /><b /><em /></span>
            <span><i /><b /><em /></span>
            <span><i /><b /><em /></span>
          </div>
        </div>
      ) : agents.length === 0 ? (
        <div className="empty-card">{t('settings.noAgentsDetected')}</div>
      ) : (
        <>
          <div className="agent-group">
            <div className="agent-group-head">
              <h4>
                {t('settings.agentInstalledGroup', { count: installedAgents.length })}
              </h4>
              <div className="agent-group-head-actions">
                {agentRescanNotice ? (
                  <span
                    className={
                      'settings-rescan-status settings-rescan-status-inline ' + agentRescanNotice.kind
                    }
                    role={agentRescanNotice.kind === 'error' ? 'alert' : 'status'}
                  >
                    {agentRescanNotice.kind === 'success'
                      ? t('settings.rescanSuccess', { count: agentRescanNotice.count })
                      : t('settings.rescanFailed')}
                  </span>
                ) : null}
                <button
                  type="button"
                  className={
                    'ghost icon-btn settings-rescan-btn agent-group-rescan-btn' +
                    (agentRescanRunning ? ' loading' : '')
                  }
                  onClick={() => void handleRefreshAgents()}
                  disabled={agentRescanRunning}
                  title={t('settings.rescanTitle')}
                >
                  {agentRescanRunning ? (
                    <>
                      <Icon name="spinner" size={13} className="icon-spin" />
                      <span>{t('settings.rescanRunning')}</span>
                    </>
                  ) : (
                    t('settings.rescan')
                  )}
                </button>
              </div>
            </div>
            {installedAgents.length > 0 ? (
              <div className="agent-grid agent-grid-installed">
                {installedAgents.map((a) => {
                  const active = cfg.agentId === a.id;
                  const running = active && agentTestState.status === 'running';
                  const isAmrAgent = a.id === 'amr';
                  const description = AGENT_SHORT_DESCRIPTIONS[a.id];
                  const agentName = displayAgentName(a);
                  const diagnosticHandlers = diagnosticHandlersForAgent(a);
                  const modelSummary = agentModelSummary(a, cfg.agentModels, t);
                  const amrBenefits = [
                    t('settings.amrBenefitOfficial'),
                    t('settings.amrBenefitManyModels'),
                  ];
                  const versionLabel = isAmrAgent ? '' : cleanAgentVersionLabel(a.name, a.version);
                  const metaLabel =
                    a.authStatus === 'missing'
                      ? t('settings.agentAuthRequired')
                      : a.authStatus === 'unknown'
                        ? t('settings.agentAuthUnknown')
                        : versionLabel
                          ? versionLabel
                          : a.id === 'amr'
                            ? ''
                            : t('common.installed');
                  const metaTitle =
                    a.authStatus === 'missing' || a.authStatus === 'unknown'
                      ? (a.authMessage ?? a.path ?? '')
                      : (a.path ?? '');
                  const amrHighlighted = isAmrAgent && amrHighlightActive;
                  const amrCardEmail =
                    isAmrAgent && active && amrCardStatus?.loggedIn
                      ? amrCardStatus.user?.email || t('settings.amrSignedIn')
                      : '';
                  const amrCardProfileBadge =
                    isAmrAgent && active && amrCardStatus?.loggedIn
                      ? amrProfileBadgeLabel(amrCardStatus.profile)
                      : null;
                  const amrWalletVisible = isAmrAgent && active && amrCardStatus?.loggedIn === true;
                  const amrStatusBalance = amrWalletVisible
                    ? formatVelaBalanceUsd(amrCardStatus?.account?.balanceUsd)
                    : null;
                  const amrWalletBalance =
                    amrWalletVisible && amrWalletSnapshot?.status === 'available'
                      ? formatAmrWalletBalance(locale, amrWalletSnapshot.balanceUsd)
                      : null;
                  const amrCardBalanceLabel =
                    isAmrAgent && active && amrCardStatus?.loggedIn
                      ? amrStatusBalance ?? amrWalletBalance
                      : null;
                  const amrCardPlanLabel =
                    isAmrAgent && active && amrCardStatus?.loggedIn
                      ? amrCardStatus.account?.plan?.trim() || null
                      : null;
                  const amrCardCanUpgrade =
                    isAmrAgent && active && amrCardStatus?.loggedIn
                      ? canUpgradeVelaPlan(amrCardStatus.account?.plan)
                      : false;
                  const amrRevealPendingCancelAction =
                    isAmrAgent &&
                    active &&
                    hoveredAgentCardId === a.id &&
                    amrCardStatus?.loggedIn !== true &&
                    amrCardStatus?.loginInFlight === true;
                  const cardEl = (
                    <div
                      key={a.id}
                      ref={isAmrAgent ? amrCardRef : undefined}
                      data-testid={`settings-agent-card-${a.id}`}
                      className={
                        'agent-card agent-card-installed' +
                        (active ? ' active' : '') +
                        (amrHighlighted ? ' agent-card--amr-highlight' : '')
                      }
                      onMouseEnter={() => {
                        if (!isAmrAgent || !active) return;
                        setHoveredAgentCardId(a.id);
                      }}
                      onMouseLeave={() => {
                        if (hoveredAgentCardId !== a.id) return;
                        setHoveredAgentCardId(null);
                      }}
                    >
                      <div className="agent-card-main">
                        <button
                          type="button"
                          className="agent-card-select"
                          data-testid={`settings-agent-select-${a.id}`}
                          onClick={() => selectAgent(a.id)}
                          aria-pressed={active}
                        >
                          <AgentIcon id={a.id} size={32} />
                          <div className="agent-card-body">
                            <div className={'agent-card-name' + (isAmrAgent ? ' agent-card-name--amr' : '')}>
                              <span className="agent-card-title">{agentName}</span>
                              {isAmrAgent ? (
                                <span className="agent-card-benefits" aria-hidden="true">
                                  {amrBenefits.map((benefit) => (
                                    <span key={benefit} className="agent-card-benefit">
                                      {benefit}
                                    </span>
                                  ))}
                                </span>
                              ) : description ? (
                                <>
                                  <span className="agent-card-name-divider" aria-hidden="true">
                                    ·
                                  </span>
                                  <span className="agent-card-tagline">{description}</span>
                                </>
                              ) : null}
                              {isAmrAgent && amrCardPlanLabel ? (
                                <VisuallyHidden>
                                  {`, ${t('settings.amrPlan')} ${amrCardPlanLabel}`}
                                </VisuallyHidden>
                              ) : null}
                            </div>
                            {metaLabel ? (
                              <div className="agent-card-meta">
                                <span title={metaTitle}>{metaLabel}</span>
                              </div>
                            ) : null}
                            {amrCardEmail ? (
                              <div className="agent-card-amr-email">
                                <span className="agent-card-amr-email-text" title={amrCardEmail}>
                                  {amrCardEmail}
                                </span>
                                {amrCardPlanLabel ? (
                                  <span className="agent-card-plan-badge-slot" aria-hidden="true">
                                    <PlanBadge
                                      plan={amrCardPlanLabel}
                                      size="sm"
                                      className="agent-card-plan-badge"
                                      title={amrCardPlanLabel ? `${t('settings.amrPlan')} ${amrCardPlanLabel}` : undefined}
                                    />
                                  </span>
                                ) : null}
                                {amrCardProfileBadge ? (
                                  <span className="agent-card-amr-profile-badge">{amrCardProfileBadge}</span>
                                ) : null}
                              </div>
                            ) : null}
                            {amrWalletVisible ? (
                              <div className="agent-card-amr-meta-row">
                                <span className="agent-card-amr-balance">
                                  <span className="agent-card-amr-balance-label">
                                    {t('settings.amrBalance')}
                                  </span>
                                  <span className="agent-card-amr-balance-value">
                                    {amrWalletValueLabel({
                                      balance: amrCardBalanceLabel,
                                      loadingLabel: t('common.loading'),
                                      ready: amrWalletReady || Boolean(amrCardBalanceLabel),
                                      snapshot: amrWalletSnapshot,
                                      unavailableLabel: t('settings.amrWalletUnavailable'),
                                    })}
                                  </span>
                                </span>
                              </div>
                            ) : null}
                            {!active && modelSummary ? (
                              <div className="agent-card-model-summary">
                                <span>{t('settings.modelPicker')}</span>
                                <strong>{modelSummary}</strong>
                              </div>
                            ) : null}
                          </div>
                        </button>
                        {isAmrAgent ? (
                          active && amrCardStatusReady ? (
                            <span className="amr-auth-anchor" onMouseEnter={dismissCoachmark}>
                              {amrCoachmarkArmed && amrCardStatus?.loggedIn === false && !amrCoachmarkDismissed ? (
                                <span className="amr-coachmark" aria-hidden="true">
                                  <span className="amr-coachmark__ring" />
                                  <svg
                                    className="amr-coachmark__cursor"
                                    width="22"
                                    height="22"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                  >
                                    <path
                                      d="M9.4 13V8a1.8 1.8 0 0 1 3.6 0v4.6c.35-.55 1-.95 1.75-.95.65 0 1.25.32 1.6.85.32-.5.9-.8 1.55-.8.8 0 1.5.5 1.78 1.2.35-.3.8-.5 1.3-.5 1.1 0 2 .9 2 2v3.05a5.6 5.6 0 0 1-5.6 5.6h-2.5a5 5 0 0 1-3.75-1.7l-4.2-4.75a1.85 1.85 0 0 1 2.65-2.6L9.4 16Z"
                                      fill="#fff"
                                      stroke="#1a1a1a"
                                      strokeWidth="1.1"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </span>
                              ) : null}
                              {amrCardCanUpgrade ? (
                                <button
                                  type="button"
                                  className="agent-card-amr-upgrade"
                                  data-testid="settings-agent-card-amr-upgrade"
                                  onClick={() => openAmrUpgrade(amrCardStatus?.profile)}
                                >
                                  {t('settings.amrUpgrade')}
                                </button>
                              ) : null}
                              <AmrLoginPill
                                className="agent-card-amr-auth"
                                hideSignedOutStatus
                                hideSignedInStatus
                                initialStatus={amrCardStatus}
                                skipInitialRefresh
                                signInLabel={t('settings.amrAuthorize')}
                                showConsoleAction={amrCardStatus?.loggedIn === true}
                                iconOnlySignOut
                                amrEntrySourceDetail="settings_amr_authorize"
                                metricsConsent={cfg.telemetry?.metrics === true}
                                installationId={cfg.installationId}
                                revealPendingCancelAction={amrRevealPendingCancelAction}
                                onStatusChange={setAmrCardStatus}
                              />
                            </span>
                          ) : (
                            <div className="agent-card-amr-auth agent-card-amr-auth--placeholder" aria-hidden="true" />
                          )
                        ) : null}
                        {active && !isAmrAgent ? (
                          <button
                            type="button"
                            className={'ghost icon-btn settings-test-btn agent-card-test-btn' + (running ? ' loading' : '')}
                            onClick={() => void handleTestAgent()}
                            disabled={running}
                            title={t('settings.testTitle')}
                          >
                            {running ? (
                              <>
                                <Icon name="spinner" size={13} className="icon-spin" />
                                <span>{t('settings.test')}</span>
                              </>
                            ) : (
                              t('settings.test')
                            )}
                          </button>
                        ) : null}
                      </div>
                      {(a.diagnostics ?? []).map((diagnostic, i) => (
                        <AgentDiagnosticRow
                          key={`${diagnostic.reason}-${i}`}
                          diagnostic={diagnostic}
                          handlers={diagnosticHandlers}
                        />
                      ))}
                      {active ? (
                        <AgentModelPicker
                          agent={a}
                          choice={cfg.agentModels?.[a.id]}
                          amrLoggedIn={amrCardStatus?.loggedIn ?? false}
                          isCustomModel={agentCustomModelIds.has(a.id)}
                          onSelectModel={(value) => onAgentModelChange(a.id, value)}
                          onCustomModelTextChange={(value) => onAgentModelCustomTextChange(a.id, value)}
                          onSelectReasoning={(value) => onAgentReasoningChange(a.id, value)}
                        />
                      ) : null}
                    </div>
                  );
                  if (active && agentTestState.status !== 'idle') {
                    const resultRow = (
                      <div key={`${a.id}__test-result`} className="agent-test-result-row">
                        {agentTestState.status === 'running' ? (
                          <p className="settings-test-status running" role="status" aria-live="polite">
                            {t('settings.testRunning')}
                          </p>
                        ) : (
                          <>
                            <p
                              className={'settings-test-status ' + testStatusVariant(agentTestState.result)}
                              role={agentTestState.result.ok ? 'status' : 'alert'}
                            >
                              {formatConnectionTestMessage(agentTestState.result, 'cli', {
                                agentId: cfg.agentId,
                                model: cfg.model,
                                locale,
                                t,
                              })}
                            </p>
                            {!agentTestState.result.ok ? (
                              <div className="settings-test-actions">
                                <div className="settings-test-actions-row">
                                  <button
                                    type="button"
                                    className="ghost icon-btn settings-test-btn"
                                    onClick={() => void handleTestAgent()}
                                  >
                                    <Icon name="reload" size={13} />
                                    <span>{t('settings.testRetry')}</span>
                                  </button>
                                </div>
                              </div>
                            ) : null}
                            {cfg.agentId === 'codex' &&
                              (() => {
                                const repair = codexPathRepairState(agentTestState.result);
                                if (!repair) return null;
                                const codexStrings = codexPathStrings(locale);
                                return (
                                  <div className="settings-test-actions">
                                    <span className="settings-test-actions-hint">{codexStrings.repairHint}</span>
                                    <div className="settings-test-actions-row">
                                      {repair.canUseDetected ? (
                                        <button
                                          type="button"
                                          className="settings-test-btn"
                                          onClick={() => applyCodexDetectedPath(repair.detectedPath)}
                                        >
                                          {codexStrings.useDetected}
                                        </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        className="ghost icon-btn settings-rescan-btn"
                                        onClick={clearCodexCustomPath}
                                      >
                                        {codexStrings.clearCustom}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })()}
                          </>
                        )}
                      </div>
                    );
                    return [cardEl, resultRow];
                  }
                  return [cardEl];
                })}
              </div>
            ) : (
              <div className="empty-card">{t('settings.noAgentsDetected')}</div>
            )}
          </div>
          {unavailableAgents.length > 0 ? (
            <details className="agent-install-collapse" open={installedAgents.length > 0 ? undefined : true}>
              <summary className="agent-install-collapse-summary">
                <span>{t('settings.agentInstallGroup', { count: unavailableAgents.length })}</span>
              </summary>
              <div className="agent-grid agent-grid-unavailable">
                {unavailableAgents.map((a) => {
                  const installUrl = sanitizeHttpsUrl(a.installUrl);
                  const docsUrl = sanitizeHttpsUrl(a.docsUrl);
                  const hasLinks = Boolean(installUrl || docsUrl);
                  const description = AGENT_SHORT_DESCRIPTIONS[a.id];
                  const agentName = displayAgentName(a);
                  const diagnosticHandlers = diagnosticHandlersForAgent(a);
                  const cardLabel = `${agentName} · ${t('common.notInstalled')}`;
                  return (
                    <div key={a.id} className="agent-card disabled agent-card-unavailable" role="group" aria-label={cardLabel}>
                      <div className="agent-card-unavailable-row">
                        <AgentIcon id={a.id} size={30} />
                        <div className="agent-card-body">
                          <div className="agent-card-name">{agentName}</div>
                          {description ? <div className="agent-card-description">{description}</div> : null}
                        </div>
                        {hasLinks ? (
                          <div className="agent-card-actions agent-card-actions--inline">
                            {docsUrl ? (
                              <a
                                href={docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="agent-card-link agent-card-link--muted agent-card-link--icon"
                                onClick={markAgentInstallIntent}
                                title={t('settings.agentInstall.docs')}
                                aria-label={t('settings.agentInstall.docs')}
                              >
                                <Icon name="file" size={15} />
                              </a>
                            ) : null}
                            {installUrl ? (
                              <a
                                href={installUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="agent-card-link agent-card-link--ghost"
                                onClick={(event) => {
                                  markAgentInstallIntent();
                                  if (a.id === 'amr') {
                                    event.currentTarget.href = attributedAmrSettingsUrl(
                                      installUrl,
                                      'settings_amr_install',
                                    );
                                  }
                                }}
                              >
                                {t('settings.agentInstall.install')}
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      {/* Why is it unavailable? not-on-path vs a broken
                          shim vs a bad *_BIN override each get a
                          distinct, actionable line. It spans the full
                          card width on its own row below the
                          logo/name/links so it never crowds the inline
                          Docs/Install actions. */}
                      {(a.diagnostics ?? []).map((diagnostic, i) => (
                        <AgentDiagnosticRow
                          key={`${diagnostic.reason}-${i}`}
                          diagnostic={diagnostic}
                          handlers={diagnosticHandlers}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
          {/*
            Show the install guide only when the user has *no*
            working agent picked yet. Older logic surfaced it
            whenever any agent on the support list was missing,
            which fired for almost everyone (few people install
            all 14 supported CLIs) — the four-step quickstart
            then sat between the agent grid and the model picker
            forever, even after the user had successfully picked
            Claude Code months ago. Once a working agent is
            selected, the guide has done its job and only adds
            noise.
          */}
          {!selectedAgent ? (
            <div className="agent-install-guide">
              <p className="hint agent-install-path-hint">{t('settings.agentInstall.pathHint')}</p>
              <ol className="agent-install-steps">
                <li>{t('settings.agentInstall.stepOpenLinks')}</li>
                <li>{t('settings.agentInstall.stepAuth')}</li>
                <li>{t('settings.agentInstall.stepRescan')}</li>
                <li>{t('settings.agentInstall.stepSelect')}</li>
              </ol>
            </div>
          ) : null}
        </>
      )}
      {(() => {
        const selected = selectedAgent;
        if (!selected) return null;
        const hasModels = Array.isArray(selected.models) && selected.models.length > 0;
        const choice = cfg.agentModels?.[selected.id] ?? {};
        const knownModelIds = selected.models?.map((m) => m.id) ?? [];
        const configuredModel = typeof choice.model === 'string' && choice.model ? choice.model : null;
        const modelValue =
          selected.id === 'amr' && configuredModel && !knownModelIds.includes(configuredModel)
            ? selected.models?.[0]?.id ?? ''
            : configuredModel ?? selected.models?.[0]?.id ?? '';
        return (
          <details className="agent-cli-env settings-memory-advanced">
            <summary className="agent-cli-env-summary">
              <span className="agent-cli-env-summary-title">{t('settings.memoryModelInlineLabel')}</span>
            </summary>
            <div className="agent-cli-env-body">
              <MemoryModelInline
                mode="daemon"
                apiProtocol={apiProtocol}
                chatApiKey={cfg.apiKey}
                chatBaseUrl={cfg.baseUrl}
                chatApiVersion={cfg.apiVersion ?? ''}
                chatModel={modelValue}
                cliAgentId={selected.id}
                cliModelOptions={hasModels ? selected.models!.map((m) => m.id) : []}
              />
            </div>
          </details>
        );
      })()}
      {(() => {
        /*
          Per-agent CLI environment overrides — proxy URLs, custom
          config dirs, and a binary path override. The previous
          layout listed every supported agent's variables in one
          long always-expanded block; for users on Claude Code
          the Codex fields were just visual filler (and vice
          versa), and the section hijacked Settings real estate
          on every open even though nine in ten users never
          touch it. Now: filtered to the *currently selected*
          agent only, and folded into a collapsed disclosure
          that opens to "Advanced: proxy & custom paths" — power
          users who route through LiteLLM or installed the
          binary out-of-PATH still have one click access; new
          users no longer wonder "are these fields I forgot to
          fill in?".
        */
        const cliEnvFields = AGENT_CLI_ENV_FIELDS.filter((field) => field.agentId === cfg.agentId);
        if (cliEnvFields.length === 0) return null;
        return (
          <details className="agent-cli-env" data-testid="settings-cli-env">
            <summary className="agent-cli-env-summary">
              <span className="agent-cli-env-summary-title">{t('settings.cliEnvTitle')}</span>
            </summary>
            <div className="agent-cli-env-body">
              <p className="hint">{t('settings.cliEnvHint')}</p>
              <div className="agent-cli-env-grid">
                {cliEnvFields.map((field) => (
                  <label className="field" key={`${field.agentId}:${field.envKey}`}>
                    <span className="field-label">
                      {t(field.labelKey)}
                      {'labelSuffix' in field ? ` (${field.labelSuffix})` : ''}
                    </span>
                    <input
                      type={'secret' in field && field.secret ? 'password' : 'text'}
                      value={cfg.agentCliEnv?.[field.agentId]?.[field.envKey] ?? ''}
                      placeholder={field.placeholder}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(e) =>
                        setCfg((c) => updateAgentCliEnvValue(c, field.agentId, field.envKey, e.target.value))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          </details>
        );
      })()}
    </section>
  );
}
