// @vitest-environment jsdom
//
// The AMR-card nudge hook — pure UI/timing state, no port. `requestAnimationFrame`
// is stubbed to invoke its callback synchronously (mirroring
// `HomeView.context-picker.test.tsx`) so the one-shot effect's rAF-deferred
// scroll/pulse/arm is observable without waiting a real frame. Pins: the nudge
// only fires for `initialHighlight === 'amr'` on the `execution` section, the
// pulse auto-clears after 3200ms while the coachmark persists, and
// `dismissCoachmark` flips the dismissed flag.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useAmrHighlight,
  type AmrHighlightInput,
} from '../../../src/features/settings/hooks/useAmrHighlight.hooks';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderAmrHighlight(over: Partial<AmrHighlightInput> = {}) {
  return renderHook(() =>
    useAmrHighlight({
      initialHighlight: 'amr',
      activeSection: 'execution',
      ...over,
    }),
  );
}

describe('useAmrHighlight', () => {
  it('no-ops when initialHighlight is not amr', () => {
    const { result } = renderAmrHighlight({ initialHighlight: null });
    expect(result.current.amrHighlightActive).toBe(false);
    expect(result.current.amrCoachmarkArmed).toBe(false);
  });

  it('no-ops when the active section is not execution', () => {
    const { result } = renderAmrHighlight({ activeSection: 'about' });
    expect(result.current.amrHighlightActive).toBe(false);
    expect(result.current.amrCoachmarkArmed).toBe(false);
  });

  it('arms the pulse + coachmark for the amr nudge (rAF runs synchronously via the stub)', () => {
    const { result } = renderAmrHighlight();
    expect(result.current.amrHighlightActive).toBe(true);
    expect(result.current.amrCoachmarkArmed).toBe(true);
    expect(result.current.amrCoachmarkDismissed).toBe(false);
  });

  it('the pulse auto-clears after 3200ms while the coachmark stays armed', () => {
    const { result } = renderAmrHighlight();
    act(() => {
      vi.advanceTimersByTime(3200);
    });
    expect(result.current.amrHighlightActive).toBe(false);
    expect(result.current.amrCoachmarkArmed).toBe(true);
  });

  it('dismissCoachmark flips amrCoachmarkDismissed', () => {
    const { result } = renderAmrHighlight();
    act(() => {
      result.current.dismissCoachmark();
    });
    expect(result.current.amrCoachmarkDismissed).toBe(true);
  });
});
