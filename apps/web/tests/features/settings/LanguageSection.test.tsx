// @vitest-environment jsdom
//
// Render coverage for the Language settings section: the locale grid marks
// the active locale, picking a tile switches `I18nProvider`'s locale, and
// the pick fires the language-click analytics event. Renders through the
// real `useLanguage` hook (locale state lives in `I18nProvider`, not local
// `useState`); `analytics/provider` is mocked so no real tracking transport
// is touched.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageSection } from '../../../src/features/settings';
import { I18nProvider } from '../../../src/i18n';

const trackMock = vi.fn();
vi.mock('../../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track: trackMock }),
}));

function Harness() {
  return (
    <I18nProvider initial="en">
      <LanguageSection />
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LanguageSection', () => {
  it('marks the initial locale tile active', () => {
    render(<Harness />);
    expect(screen.getByRole('radio', { name: /English/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('picking another locale marks it active and fires the tracking event', () => {
    render(<Harness />);
    const french = screen.getByRole('radio', { name: /fr/ });
    fireEvent.click(french);
    expect(french).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /English/ })).toHaveAttribute('aria-checked', 'false');
    expect(trackMock).toHaveBeenCalledWith(
      'ui_click',
      { page_name: 'settings', area: 'language', element: 'fr' },
      undefined,
    );
  });
});
