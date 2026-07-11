// @vitest-environment jsdom
//
// Render coverage for the Orbit automation section. Renders through the real
// `useWiredOrbit` hook (mirroring ConnectorSection.test.tsx), so a stubbed
// global `fetch` keeps status/templates/connectors deterministic instead of
// hitting the network. Covers: the hero + run CTA, the configuration gate
// (shown/hidden, copy branch, CTA), and the daily-summary switch driving
// `setCfg`.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../src/types';
import { OrbitSection } from '../../../src/features/settings';
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

function stubFetch(connectedCount: number): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/orbit/status')) {
      return { ok: true, json: async () => ({ running: false, lastRun: null }) } as Response;
    }
    if (url.startsWith('/api/design-templates')) {
      return { ok: true, json: async () => ({ designTemplates: [] }) } as Response;
    }
    if (url.startsWith('/api/connectors')) {
      const connectors = Array.from({ length: connectedCount }, (_, i) => ({
        id: `c${i}`,
        status: 'connected',
      }));
      return { ok: true, json: async () => ({ connectors }) } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  }) as typeof fetch;
}

function Harness({
  initial,
  onOpenComposioSection = vi.fn(),
}: {
  initial: AppConfig;
  onOpenComposioSection?: () => void;
}) {
  const [cfg, setCfg] = useState(initial);
  return (
    <I18nProvider initial="en">
      <OrbitSection
        cfg={cfg}
        setCfg={setCfg}
        composioApiKeyConfigured={false}
        onOpenComposioSection={onOpenComposioSection}
        onLeaveForOrbitProject={vi.fn()}
      />
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('OrbitSection', () => {
  it('renders the hero and the run CTA', async () => {
    stubFetch(1);
    render(<Harness initial={baseConfig} />);
    expect(await screen.findByTestId('orbit-automation-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run it now|Running/ })).toBeInTheDocument();
  });

  it('shows the configuration gate with zero connected integrations and routes its CTA to Composio', async () => {
    stubFetch(0);
    const onOpenComposioSection = vi.fn();
    render(<Harness initial={baseConfig} onOpenComposioSection={onOpenComposioSection} />);

    const gate = await screen.findByTestId('orbit-config-gate');
    expect(gate).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('orbit-config-gate-action'));
    expect(onOpenComposioSection).toHaveBeenCalledTimes(1);
  });

  it('hides the configuration gate once a connector is connected', async () => {
    stubFetch(1);
    render(<Harness initial={baseConfig} />);
    await screen.findByTestId('orbit-automation-card');
    expect(screen.queryByTestId('orbit-config-gate')).not.toBeInTheDocument();
  });

  it('toggles the daily-summary switch through setCfg', async () => {
    stubFetch(1);
    render(<Harness initial={baseConfig} />);
    const toggle = await screen.findByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
  });
});
