// @vitest-environment jsdom
//
// Render coverage for the Local CLI agent grid: props in, JSX out — the
// `daemonAgents`/`amrAccount`/`amrHighlight` controllers are hand-written
// fakes (mirroring the injectable-hooks pattern), not the real hooks. Covers:
// the installed/unavailable agent groups, selecting an agent, rescan,
// the connection test result row, and the install guide's absence once an
// agent is selected.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../src/types';
import { LocalCliSection } from '../../../src/features/settings';
import { I18nProvider } from '../../../src/i18n';
import type { DaemonAgentsController } from '../../../src/features/settings/hooks/useDaemonAgents.hooks';
import type { AmrAccountController } from '../../../src/features/settings/hooks/useAmrAccount.hooks';
import type { AmrHighlightController } from '../../../src/features/settings/hooks/useAmrHighlight.hooks';

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: '',
  model: 'claude-sonnet-4-5',
  agentId: 'claude',
  skillId: null,
  designSystemId: null,
};

function fakeAmrAccount(over: Partial<AmrAccountController> = {}): AmrAccountController {
  return {
    amrCardStatus: null,
    setAmrCardStatus: vi.fn(),
    amrCardStatusReady: true,
    amrWalletSnapshot: null,
    amrWalletReady: true,
    refreshAmrWalletSnapshot: vi.fn(async () => {}),
    ...over,
  };
}

function fakeAmrHighlight(over: Partial<AmrHighlightController> = {}): AmrHighlightController {
  return {
    amrCardRef: { current: null },
    amrHighlightActive: false,
    amrCoachmarkArmed: false,
    amrCoachmarkDismissed: false,
    dismissCoachmark: vi.fn(),
    ...over,
  };
}

function fakeDaemonAgents(over: Partial<DaemonAgentsController> = {}): DaemonAgentsController {
  return {
    agentRescanRunning: false,
    agentRescanNotice: null,
    agentTestState: { status: 'idle' },
    setAgentTestState: vi.fn(),
    hoveredAgentCardId: null,
    setHoveredAgentCardId: vi.fn(),
    agentCustomModelIds: new Set(),
    setAgentCustomModelIds: vi.fn(),
    installedCount: 1,
    visibleAgents: [{ id: 'claude', name: 'Claude Code', bin: 'claude', available: true } as any],
    installedAgents: [
      { id: 'claude', name: 'Claude Code', bin: 'claude', available: true } as any,
    ],
    unavailableAgents: [],
    initialAgentScanRunning: false,
    handleTestAgent: vi.fn(async () => {}),
    handleRefreshAgents: vi.fn(async () => {}),
    markAgentInstallIntent: vi.fn(),
    attributedAmrSettingsUrl: (url) => url,
    openAgentFixUrl: vi.fn(),
    diagnosticHandlersForAgent: () => ({ onRescan: vi.fn() }),
    selectAgent: vi.fn(),
    openAmrUpgrade: vi.fn(),
    canUpgradeVelaPlan: () => false,
    formatVelaBalanceUsd: () => null,
    applyCodexDetectedPath: vi.fn(),
    clearCodexCustomPath: vi.fn(),
    onAgentModelChange: vi.fn(),
    onAgentModelCustomTextChange: vi.fn(),
    onAgentReasoningChange: vi.fn(),
    ...over,
  };
}

function renderSection(
  over: {
    cfg?: AppConfig;
    daemonAgents?: Partial<DaemonAgentsController>;
    amrAccount?: Partial<AmrAccountController>;
    amrHighlight?: Partial<AmrHighlightController>;
    hoveredAgentCardId?: string | null;
    setHoveredAgentCardId?: (id: string | null) => void;
  } = {},
) {
  const daemonAgents = fakeDaemonAgents(over.daemonAgents);
  return render(
    <I18nProvider initial="en">
      <LocalCliSection
        cfg={over.cfg ?? baseConfig}
        setCfg={vi.fn()}
        agents={daemonAgents.installedAgents.concat(daemonAgents.unavailableAgents)}
        apiProtocol="anthropic"
        locale="en"
        amrAccount={fakeAmrAccount(over.amrAccount)}
        amrHighlight={fakeAmrHighlight(over.amrHighlight)}
        daemonAgents={daemonAgents}
        hoveredAgentCardId={over.hoveredAgentCardId ?? null}
        setHoveredAgentCardId={over.setHoveredAgentCardId ?? vi.fn()}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe('LocalCliSection', () => {
  it('renders the installed agent card as active and selecting it calls selectAgent', () => {
    const selectAgent = vi.fn();
    renderSection({ daemonAgents: { selectAgent } });
    const card = screen.getByTestId('settings-agent-select-claude');
    expect(card).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(card);
    expect(selectAgent).toHaveBeenCalledWith('claude');
  });

  it('clicking Rescan calls handleRefreshAgents', () => {
    const handleRefreshAgents = vi.fn(async () => {});
    renderSection({ daemonAgents: { handleRefreshAgents } });
    fireEvent.click(screen.getByTitle('Re-scan PATH'));
    expect(handleRefreshAgents).toHaveBeenCalledTimes(1);
  });

  it('renders the unavailable-agent group with install/docs links', () => {
    renderSection({
      daemonAgents: {
        installedAgents: [],
        unavailableAgents: [
          {
            id: 'codex',
            name: 'Codex',
            bin: 'codex',
            available: false,
            docsUrl: 'https://example.com/docs',
            installUrl: 'https://example.com/install',
          } as any,
        ],
      },
    });
    expect(screen.getByText('Install')).toBeInTheDocument();
  });

  it('shows the install guide when no agent is selected/available', () => {
    renderSection({
      cfg: { ...baseConfig, agentId: null },
      daemonAgents: {
        installedAgents: [
          { id: 'claude', name: 'Claude Code', bin: 'claude', available: true } as any,
        ],
      },
    });
    expect(screen.getByText(/ensure the tool's bin directory is on the PATH/)).toBeInTheDocument();
  });

  it('renders the test result row for the active agent', () => {
    renderSection({
      daemonAgents: {
        agentTestState: {
          status: 'done',
          result: { ok: true, latencyMs: 12, model: 'claude-sonnet-4-5', agentName: 'Claude Code', sample: 'hi' } as any,
        },
      },
    });
    expect(screen.getByText(/Claude Code replied in 12 ms/)).toBeInTheDocument();
  });

  it('shows the running state and disables the test button', () => {
    renderSection({ daemonAgents: { agentTestState: { status: 'running' } } });
    expect(screen.getByText('Testing connection…')).toBeInTheDocument();
  });
});
