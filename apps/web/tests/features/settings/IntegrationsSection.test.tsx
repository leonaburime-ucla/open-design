// @vitest-environment jsdom
//
// Render coverage for the Integrations section: the client picker's default
// (Claude Code) snippet, switching clients, the Codex one-click install
// toggle nested for the Codex client, and the copy button. Renders through
// the real `useWiredIntegrations`/`useWiredCodexInstallToggle` hooks
// (mirroring OrbitSection.test.tsx), so a stubbed global `fetch` keeps
// install-info/codex-status deterministic instead of hitting the network.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntegrationsSection } from '../../../src/features/settings';
import { I18nProvider } from '../../../src/i18n';

const originalFetch = globalThis.fetch;
const originalClipboard = globalThis.navigator.clipboard;

function stubFetch(over: { codexAvailable?: boolean; codexInstalled?: boolean } = {}): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/mcp/install-info')) {
      return {
        ok: true,
        json: async () => ({
          command: '/usr/bin/node',
          args: ['/opt/open-design/cli.js', 'mcp'],
          daemonUrl: 'http://127.0.0.1:7456',
          platform: 'darwin',
          cliExists: true,
          nodeExists: true,
          buildHint: null,
        }),
      } as Response;
    }
    if (url.startsWith('/api/mcp/install/codex/status')) {
      return {
        ok: true,
        json: async () => ({
          available: over.codexAvailable ?? false,
          installed: over.codexInstalled ?? false,
        }),
      } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  }) as typeof fetch;
}

function Harness() {
  return (
    <I18nProvider initial="en">
      <IntegrationsSection />
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: originalClipboard,
    configurable: true,
  });
});

describe('IntegrationsSection', () => {
  it('defaults to the Claude Code client and renders its snippet once install-info loads', async () => {
    stubFetch();
    render(<Harness />);

    expect(await screen.findByText('Claude Code')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/claude mcp add-json --scope user open-design/)).toBeInTheDocument();
    });
  });

  it('switching to VS Code via the picker renders its JSON snippet', async () => {
    stubFetch();
    render(<Harness />);
    await screen.findByText('Claude Code');

    fireEvent.click(screen.getByRole('button', { name: /Claude Code/ }));
    fireEvent.click(screen.getByRole('option', { name: /VS Code/ }));

    await waitFor(() => {
      expect(screen.getByText(/"servers"/)).toBeInTheDocument();
    });
  });

  it('nests the Codex one-click install toggle only for the Codex client', async () => {
    stubFetch({ codexAvailable: true, codexInstalled: false });
    render(<Harness />);
    await screen.findByText('Claude Code');

    expect(screen.queryByRole('button', { name: /Install in Codex/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Claude Code/ }));
    fireEvent.click(screen.getByRole('option', { name: /Codex/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Install in Codex/i })).toBeInTheDocument();
    });
  });

  it('copies the snippet to the clipboard and flashes Copied', async () => {
    stubFetch();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(<Harness />);
    await waitFor(() => {
      expect(screen.getByText(/claude mcp add-json --scope user open-design/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
  });

  it('surfaces the daemon error banner when install-info fails', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response);
    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByText(/daemon 500/)).toBeInTheDocument();
    });
  });
});
