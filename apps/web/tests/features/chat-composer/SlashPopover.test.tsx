// @vitest-environment jsdom
//
// SlashPopover is pure presentation: it renders a keyboard-navigable list of
// slash commands and reports pick/hover. `t` is injected as a prop, so no
// I18nProvider is needed. Pins the active-row marking and the callbacks.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SlashPopover } from '../../../src/features/chat-composer/components/SlashPopover';
import type { SlashCommand, TranslateFn } from '../../../src/features/chat-composer/types';

const t: TranslateFn = (key) => String(key);

const commands: SlashCommand[] = [
  { id: 'hatch', label: '/hatch', insert: '/hatch ', descKey: 'common.delete', icon: 'sparkles' },
  { id: 'inspect', label: '/inspect', insert: '/inspect ', descKey: 'common.close', icon: 'eye' },
];

afterEach(cleanup);

describe('SlashPopover', () => {
  it('renders every command and marks the active row', () => {
    render(<SlashPopover commands={commands} activeIndex={1} onPick={vi.fn()} onHover={vi.fn()} t={t} />);
    expect(screen.getByText('/hatch')).toBeTruthy();
    const active = screen.getByRole('option', { selected: true });
    expect(active.textContent).toContain('/inspect');
  });

  it('fires onPick / onHover for the right command', () => {
    const onPick = vi.fn();
    const onHover = vi.fn();
    render(<SlashPopover commands={commands} activeIndex={0} onPick={onPick} onHover={onHover} t={t} />);
    fireEvent.mouseEnter(screen.getByText('/inspect').closest('button')!);
    expect(onHover).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByText('/hatch').closest('button')!);
    expect(onPick).toHaveBeenCalledWith(commands[0]);
  });
});
