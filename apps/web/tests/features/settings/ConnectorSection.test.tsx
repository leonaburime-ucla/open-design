// @vitest-environment jsdom
//
// Render coverage for the connectors section: the credential form renders its
// label, password input, and Save/Clear controls; typing enables Save and a
// click drives the injected persist transport; the Clear flow opens its
// two-stage confirmation. The catalogue browser gates its own fetches on the
// unconfigured state, so a stubbed global fetch keeps the render inert.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../src/types';
import { ConnectorSection } from '../../../src/features/settings';
import { I18nProvider } from '../../../src/i18n';

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: 'sk-test',
  apiProtocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

const originalFetch = globalThis.fetch;

function Harness({
  initial,
  onPersist,
}: {
  initial: AppConfig;
  onPersist: (composio: AppConfig['composio']) => Promise<void> | void;
}) {
  const [cfg, setCfg] = useState(initial);
  return (
    <I18nProvider initial="en">
      <ConnectorSection cfg={cfg} setCfg={setCfg} onPersistComposioKey={onPersist} />
    </I18nProvider>
  );
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('ConnectorSection', () => {
  it('renders the credential form with a password input and Save/Clear controls', () => {
    render(<Harness initial={{ ...baseConfig, composio: {} }} onPersist={vi.fn()} />);
    const input = document.querySelector('input[type="password"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(screen.getByRole('button', { name: /Save/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear/ })).toBeInTheDocument();
  });

  it('persists the typed key through the injected transport on Save', async () => {
    const onPersist = vi.fn(async () => {});
    render(<Harness initial={{ ...baseConfig, composio: {} }} onPersist={onPersist} />);
    const input = document.querySelector('input[type="password"]') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'sk-new-key' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    await waitFor(() => expect(onPersist).toHaveBeenCalled());
    expect(onPersist).toHaveBeenCalledWith({ apiKey: 'sk-new-key' });
  });

  it('opens the two-stage clear confirmation for a saved key', () => {
    render(
      <Harness
        initial={{ ...baseConfig, composio: { apiKeyConfigured: true, apiKeyTail: '4242' } }}
        onPersist={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
