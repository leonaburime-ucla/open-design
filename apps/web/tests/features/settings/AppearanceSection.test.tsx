// @vitest-environment jsdom
//
// Render coverage for the Appearance section: the theme segmented control
// (default system, switching to light/dark drives `setCfg`), and the accent
// swatch picker (selecting a swatch marks it active). Renders through the
// real `useAppearance` hook (mirroring OrbitSection.test.tsx); no transport
// to stub since this section's only side effect is a synchronous document
// mutation.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../src/types';
import { AppearanceSection } from '../../../src/features/settings';
import { I18nProvider } from '../../../src/i18n';
import { DEFAULT_ACCENT_COLOR } from '../../../src/state/appearance';

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

function Harness({ initial }: { initial: AppConfig }) {
  const [cfg, setCfg] = useState(initial);
  return (
    <I18nProvider initial="en">
      <AppearanceSection cfg={cfg} setCfg={setCfg} />
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AppearanceSection', () => {
  it('defaults to the System theme active', () => {
    render(<Harness initial={baseConfig} />);
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking Dark marks it active', () => {
    render(<Harness initial={baseConfig} />);
    const dark = screen.getByRole('button', { name: 'Dark' });
    fireEvent.click(dark);
    expect(dark).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks the default accent swatch active by default and switching swatches updates it', () => {
    render(<Harness initial={baseConfig} />);
    const defaultSwatch = screen.getByRole('radio', { name: 'Default accent color' });
    expect(defaultSwatch).toHaveAttribute('aria-checked', 'true');

    const other = screen.getAllByRole('radio').find((r) => r !== defaultSwatch)!;
    fireEvent.click(other);
    expect(other).toHaveAttribute('aria-checked', 'true');
    expect(defaultSwatch).toHaveAttribute('aria-checked', 'false');
  });

  it('the custom color input reflects the current accent', () => {
    render(<Harness initial={{ ...baseConfig, accentColor: '#2563eb' }} />);
    const input = screen.getByLabelText('Custom color') as HTMLInputElement;
    expect(input.value).toBe('#2563eb');
  });

  it('an invalid stored accent color falls back to the default', () => {
    render(<Harness initial={{ ...baseConfig, accentColor: 'not-a-color' }} />);
    const input = screen.getByLabelText('Custom color') as HTMLInputElement;
    expect(input.value).toBe(DEFAULT_ACCENT_COLOR);
  });
});
