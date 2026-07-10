// @vitest-environment node
//
// The composer-dom bridges guard their `window` access with
// `typeof window === 'undefined'`. Those guards are unreachable under jsdom, so
// this companion suite runs in the node environment (no `window`) to exercise
// the SSR fallbacks for real.
import { describe, expect, it, vi } from 'vitest';

import { getViewportSize, subscribeEscapeKey } from '../../../src/providers/composer-dom';

describe('composer-dom SSR fallbacks (no window)', () => {
  it('has no window in this environment', () => {
    expect(typeof window).toBe('undefined');
  });

  it('subscribeEscapeKey returns an inert unsubscribe', () => {
    const onEscape = vi.fn();
    const unsubscribe = subscribeEscapeKey(onEscape);
    expect(() => unsubscribe()).not.toThrow();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('getViewportSize returns a zero size', () => {
    expect(getViewportSize()).toEqual({ width: 0, height: 0 });
  });
});
