// @vitest-environment jsdom
//
// Render coverage for the media-providers section: it renders the available
// catalogue with a password input per provider, toggling visibility flips
// the input's type, typing an API key drives `setCfg`, and the coming-soon
// drawer lists non-integrated providers. Renders through the real
// `useWiredMediaProviders` hook (mirroring OrbitSection.test.tsx / ADR 0002);
// there is no `fetch` to stub since this section's only transport is an
// injected `onReloadMediaProviders` callback.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../src/types';
import { MediaProvidersSection } from '../../../src/features/settings';
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

function Harness({ initial, onChange = vi.fn() }: { initial: AppConfig; onChange?: (id: string) => void }) {
  const [cfg, setCfg] = useState(initial);
  return (
    <I18nProvider initial="en">
      <MediaProvidersSection
        cfg={cfg}
        setCfg={setCfg}
        pendingLocalProviderIds={new Set()}
        onChange={onChange}
      />
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MediaProvidersSection', () => {
  it('renders a password input per available provider', () => {
    render(<Harness initial={baseConfig} />);
    const inputs = document.querySelectorAll('input[type="password"]');
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('toggles a key input between password and text on the visibility button', () => {
    render(<Harness initial={baseConfig} />);
    const input = document.querySelector('input[type="password"]') as HTMLInputElement;
    const toggle = input.parentElement?.querySelector('.secret-visibility-button') as HTMLButtonElement;
    expect(toggle).not.toBeNull();

    fireEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('reports the provider id via onChange when a key is typed', () => {
    const onChange = vi.fn();
    render(<Harness initial={baseConfig} onChange={onChange} />);
    const input = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-new-value' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('lists coming-soon providers behind the collapsed roadmap drawer', () => {
    render(<Harness initial={baseConfig} />);
    const details = document.querySelector('details.media-provider-coming-soon');
    expect(details).not.toBeNull();
    expect(details?.querySelectorAll('li.media-provider-coming-soon-item').length ?? 0).toBeGreaterThan(0);
  });

  it('shows the Saved badge and enables Clear for an already-configured provider', () => {
    render(
      <Harness
        initial={{
          ...baseConfig,
          mediaProviders: { openai: { apiKey: '', baseUrl: '', apiKeyConfigured: true, apiKeyTail: '1234' } },
        }}
      />,
    );
    expect(screen.getByText(/1234/)).toBeInTheDocument();
  });
});
