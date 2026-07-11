// @vitest-environment jsdom
//
// Render coverage for the per-agent model/reasoning picker: props in, JSX
// out. Covers the AMR-loading state (signed in, no live models yet), the
// model select forwarding raw picker values, the custom-model text field
// only appearing when active, and the reasoning select.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentModelPicker } from '../../../src/features/settings/components/AgentModelPicker';
import { I18nProvider } from '../../../src/i18n';
import type { AgentInfo, AgentModelChoice } from '../../../src/types';

function agent(over: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    available: true,
    models: [
      { id: 'claude-sonnet-4-5', label: 'Sonnet' },
      { id: 'claude-opus-4', label: 'Opus' },
    ],
    ...over,
  };
}

function renderPicker(over: {
  agent?: AgentInfo;
  choice?: AgentModelChoice;
  amrLoggedIn?: boolean;
  isCustomModel?: boolean;
  onSelectModel?: (v: string) => void;
  onCustomModelTextChange?: (v: string) => void;
  onSelectReasoning?: (v: string) => void;
} = {}) {
  return render(
    <I18nProvider initial="en">
      <AgentModelPicker
        agent={over.agent ?? agent()}
        choice={over.choice}
        amrLoggedIn={over.amrLoggedIn ?? false}
        isCustomModel={over.isCustomModel ?? false}
        onSelectModel={over.onSelectModel ?? vi.fn()}
        onCustomModelTextChange={over.onCustomModelTextChange ?? vi.fn()}
        onSelectReasoning={over.onSelectReasoning ?? vi.fn()}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe('AgentModelPicker', () => {
  it('shows the AMR loading state when signed in with no live models yet', () => {
    renderPicker({ agent: agent({ id: 'amr', models: [] }), amrLoggedIn: true });
    expect(screen.getByTestId('settings-agent-model-loading-amr')).toBeInTheDocument();
  });

  it('returns null when the agent has neither models nor reasoning options', () => {
    const { container } = renderPicker({ agent: agent({ models: [] }) });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the custom-text field only when a custom model id is active', () => {
    const { rerender } = renderPicker({ choice: { model: 'claude-sonnet-4-5' } });
    expect(screen.queryByPlaceholderText('e.g. anthropic/claude-sonnet-4-6')).not.toBeInTheDocument();

    rerender(
      <I18nProvider initial="en">
        <AgentModelPicker
          agent={agent()}
          choice={{ model: 'some-unknown-model' }}
          amrLoggedIn={false}
          isCustomModel
          onSelectModel={vi.fn()}
          onCustomModelTextChange={vi.fn()}
          onSelectReasoning={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByPlaceholderText('e.g. anthropic/claude-sonnet-4-6')).toBeInTheDocument();
  });

  it('forwards the custom-text change', () => {
    const onCustomModelTextChange = vi.fn();
    renderPicker({ isCustomModel: true, onCustomModelTextChange });
    fireEvent.change(screen.getByPlaceholderText('e.g. anthropic/claude-sonnet-4-6'), { target: { value: 'my-model' } });
    expect(onCustomModelTextChange).toHaveBeenCalledWith('my-model');
  });

  it('renders the reasoning select and forwards a change', () => {
    const onSelectReasoning = vi.fn();
    renderPicker({
      agent: agent({ models: [], reasoningOptions: [{ id: 'low', label: 'Low' }, { id: 'high', label: 'High' }] }),
      onSelectReasoning,
    });
    fireEvent.change(screen.getByDisplayValue('Low'), { target: { value: 'high' } });
    expect(onSelectReasoning).toHaveBeenCalledWith('high');
  });
});
