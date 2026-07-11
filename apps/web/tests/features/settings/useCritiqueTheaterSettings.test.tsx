// @vitest-environment jsdom
//
// The Critique Theater settings hook against mocked
// `components/Theater`/`router` modules (its business logic reaches the
// browser localStorage read/write + route state directly — see the hook's
// header comment — so this is a module mock rather than a fake port). Pins:
// the enabled flag mirrors `useCritiqueTheaterEnabled()`, the active project
// id derives from the current route, and `setEnabled` threads that project
// id into `setCritiqueTheaterEnabled` only when one is active.
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCritiqueTheaterSettings } from '../../../src/features/settings/hooks/useCritiqueTheaterSettings.hooks';
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

describe('useCritiqueTheaterSettings', () => {
  it('mirrors useCritiqueTheaterEnabled() and has no active project outside a project route', () => {
    vi.mocked(useCritiqueTheaterEnabled).mockReturnValue(true);
    vi.mocked(useRoute).mockReturnValue({ kind: 'home', view: 'home' } as ReturnType<typeof useRoute>);

    const { result } = renderHook(() => useCritiqueTheaterSettings());
    expect(result.current.enabled).toBe(true);
    expect(result.current.activeProjectId).toBeNull();
  });

  it('derives the active project id from a project route', () => {
    vi.mocked(useRoute).mockReturnValue({
      kind: 'project',
      projectId: 'proj-1',
      conversationId: null,
      fileName: null,
    } as ReturnType<typeof useRoute>);

    const { result } = renderHook(() => useCritiqueTheaterSettings());
    expect(result.current.activeProjectId).toBe('proj-1');
  });

  it('setEnabled persists localStorage-only when no project is active', () => {
    vi.mocked(useRoute).mockReturnValue({ kind: 'home', view: 'home' } as ReturnType<typeof useRoute>);
    const { result } = renderHook(() => useCritiqueTheaterSettings());

    result.current.setEnabled(true);

    expect(setCritiqueTheaterEnabled).toHaveBeenCalledWith(true);
    expect(setCritiqueTheaterEnabled).not.toHaveBeenCalledWith(true, expect.anything());
  });

  it('setEnabled threads the active project id into the daemon-metadata PATCH', () => {
    vi.mocked(useRoute).mockReturnValue({
      kind: 'project',
      projectId: 'proj-1',
      conversationId: null,
      fileName: null,
    } as ReturnType<typeof useRoute>);
    const { result } = renderHook(() => useCritiqueTheaterSettings());

    result.current.setEnabled(false);

    expect(setCritiqueTheaterEnabled).toHaveBeenCalledWith(false, { projectId: 'proj-1' });
  });
});
