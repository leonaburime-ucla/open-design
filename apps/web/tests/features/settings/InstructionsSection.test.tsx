// @vitest-environment jsdom
//
// Render coverage for the custom-instructions section: the textarea reflects
// `cfg.customInstructions`, and typing calls `setCfg` with the new value (an
// empty value clears the field to `undefined`, matching the original inline
// handler). Renders through the real `useInstructions` hook.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../src/types';
import { InstructionsSection } from '../../../src/features/settings';
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

function Harness({ initial }: { initial: AppConfig }) {
  const [cfg, setCfg] = useState(initial);
  return (
    <I18nProvider initial="en">
      <InstructionsSection cfg={cfg} setCfg={setCfg} />
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InstructionsSection', () => {
  it('reflects the saved custom instructions', () => {
    render(<Harness initial={{ ...baseConfig, customInstructions: 'Always use TypeScript.' }} />);
    expect(screen.getByRole('textbox')).toHaveValue('Always use TypeScript.');
  });

  it('typing updates the field value', () => {
    render(<Harness initial={baseConfig} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Prefer named exports.' } });
    expect(textarea).toHaveValue('Prefer named exports.');
  });

  it('clearing the field leaves it empty', () => {
    render(<Harness initial={{ ...baseConfig, customInstructions: 'Some rule.' }} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '' } });
    expect(textarea).toHaveValue('');
  });
});
