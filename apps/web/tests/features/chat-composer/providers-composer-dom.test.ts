// @vitest-environment jsdom
//
// The composer-dom bridges wrap the two pieces of DOM the slice's dumb
// components need (an Escape-key subscription and the viewport size). SSR
// fallbacks live in the companion `-ssr` suite (node env).
import { describe, expect, it, vi } from 'vitest';

import { getViewportSize, subscribeEscapeKey } from '../../../src/providers/composer-dom';

describe('subscribeEscapeKey', () => {
  it('invokes the handler on Escape and stops after unsubscribe', () => {
    const onEscape = vi.fn();
    const unsubscribe = subscribeEscapeKey(onEscape);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onEscape).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onEscape).toHaveBeenCalledTimes(1);
    unsubscribe();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});

describe('getViewportSize', () => {
  it('reads the current window dimensions', () => {
    expect(getViewportSize()).toEqual({ width: window.innerWidth, height: window.innerHeight });
  });
});
