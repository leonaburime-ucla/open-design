// @vitest-environment jsdom
//
// StagedCommentAttachments is pure presentation: it renders staged comment
// chips (excluding visual selections) and reports removal. `t` is injected.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatCommentAttachment } from '@open-design/contracts';

import { StagedCommentAttachments } from '../../../src/features/chat-composer/components/StagedCommentAttachments';
import type { TranslateFn } from '../../../src/features/chat-composer/types';

const t: TranslateFn = (key) => String(key);

function comment(id: string, over: Partial<ChatCommentAttachment> = {}): ChatCommentAttachment {
  return {
    id,
    order: 0,
    filePath: 'index.html',
    elementId: id,
    selector: `#${id}`,
    label: `Label ${id}`,
    comment: `Comment ${id}`,
    currentText: '',
    pagePosition: { x: 0, y: 0 },
    htmlHint: '',
    ...over,
  } as ChatCommentAttachment;
}

afterEach(cleanup);

describe('StagedCommentAttachments', () => {
  it('renders non-visual comment chips', () => {
    render(<StagedCommentAttachments attachments={[comment('a')]} onRemove={vi.fn()} t={t} />);
    expect(screen.getByTestId('staged-comment-attachments')).toBeTruthy();
    expect(screen.getByText('Comment a')).toBeTruthy();
  });

  it('renders nothing when every attachment is a visual selection', () => {
    const { container } = render(
      <StagedCommentAttachments
        attachments={[comment('a', { selectionKind: 'visual' })]}
        onRemove={vi.fn()}
        t={t}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('fires onRemove with the attachment id', () => {
    const onRemove = vi.fn();
    render(<StagedCommentAttachments attachments={[comment('a')]} onRemove={onRemove} t={t} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onRemove).toHaveBeenCalledWith('a');
  });
});
