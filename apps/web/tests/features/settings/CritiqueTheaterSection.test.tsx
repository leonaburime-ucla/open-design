// @vitest-environment jsdom
//
// Render coverage for the Critique Theater settings section: the checkbox
// reflects `useCritiqueTheaterEnabled()`, toggling it calls
// `setCritiqueTheaterEnabled` (with the active project id when on a project
// route), and the project/no-project hint swaps accordingly. Renders through
// the real `useCritiqueTheaterSettings` hook, with `components/Theater` and
// `router` mocked so no real localStorage/route state is touched.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CritiqueTheaterSection } from '../../../src/features/settings';
import { I18nProvider } from '../../../src/i18n';
import { setCritiqueTheaterEnabled, useCritiqueTheaterEnabled } from '../../../src/components/Theater';
import { useRoute } from '../../../src/router';

vi.mock('../../../src/components/Theater', () => ({
  useCritiqueTheaterEnabled: vi.fn(() => false),
  setCritiqueTheaterEnabled: vi.fn(async () => {}),
}));

vi.mock('../../../src/router', () => ({
  useRoute: vi.fn(() => ({ kind: 'home', view: 'home' })),
  navigate: vi.fn(),
}));

function Harness() {
  return (
    <I18nProvider initial="en">
      <CritiqueTheaterSection />
    </I18nProvider>
  );
}

beforeEach(() => {
  vi.mocked(useCritiqueTheaterEnabled).mockReturnValue(false);
  vi.mocked(useRoute).mockReturnValue({ kind: 'home', view: 'home' } as ReturnType<typeof useRoute>);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CritiqueTheaterSection', () => {
  it('reflects the enabled flag on the checkbox', () => {
    vi.mocked(useCritiqueTheaterEnabled).mockReturnValue(true);
    render(<Harness />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('shows the no-project hint outside a project route', () => {
    render(<Harness />);
    expect(screen.getByText(/Open a project to persist this server-side/)).toBeInTheDocument();
  });

  it('shows the per-project hint on a project route', () => {
    vi.mocked(useRoute).mockReturnValue({
      kind: 'project',
      projectId: 'proj-1',
      conversationId: null,
      fileName: null,
    } as ReturnType<typeof useRoute>);
    render(<Harness />);
    expect(screen.getByText(/Saved for this project/)).toBeInTheDocument();
  });

  it('toggling on outside a project route persists localStorage-only', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(setCritiqueTheaterEnabled).toHaveBeenCalledWith(true);
  });

  it('toggling on a project route threads the project id', () => {
    vi.mocked(useRoute).mockReturnValue({
      kind: 'project',
      projectId: 'proj-1',
      conversationId: null,
      fileName: null,
    } as ReturnType<typeof useRoute>);
    render(<Harness />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(setCritiqueTheaterEnabled).toHaveBeenCalledWith(true, { projectId: 'proj-1' });
  });
});
