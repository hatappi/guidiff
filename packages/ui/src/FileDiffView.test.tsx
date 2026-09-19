import { expect, test, mock } from 'bun:test';
import { fireEvent, render, within } from '@testing-library/react';
import FileDiffView from './components/FileDiffView.tsx';

const file = {
  path: 'src/a.ts', status: 'modified' as const, binary: false,
  hunks: [{ header: '@@ -1,1 +1,1 @@', lines: [
    { type: 'del' as const, oldLine: 1, text: 'const a = 1;' },
    { type: 'add' as const, newLine: 1, text: 'const a = 2;' },
  ] }],
  patch: 'x',
  state: { viewed: false, changedSinceLastView: true, lastViewedAt: '2026-07-19T01:00:00Z' },
};

const noop = () => {};

test('shows changed badge and viewed checkbox toggles', () => {
  const onToggleViewed = mock(noop);
  const { container } = render(
    <FileDiffView
      file={file}
      comments={[]}
      viewMode="unified"
      onToggleViewed={onToggleViewed}
      onAddComment={noop}
      onUpdateComment={noop}
      onDeleteComment={noop}
    />,
  );
  const scope = within(container as HTMLElement);
  expect(scope.getByText('Changed since last view')).toBeTruthy();
  const checkbox = scope.getByLabelText('Viewed') as HTMLInputElement;
  fireEvent.click(checkbox);
  expect(onToggleViewed).toHaveBeenCalledWith('src/a.ts', true);
});

test('split mode renders old and new side by side', () => {
  const { container } = render(
    <FileDiffView file={file} comments={[]} viewMode="split"
      onToggleViewed={noop} onAddComment={noop} onUpdateComment={noop} onDeleteComment={noop} />,
  );
  const scope = within(container as HTMLElement);
  expect(scope.getByText('const a = 1;')).toBeTruthy();
  expect(scope.getByText('const a = 2;')).toBeTruthy();
});

test('Ask AI from a line comment passes the selection as context and posts no comment', () => {
  const onAddComment = mock(noop);
  const onAskAi = mock(noop);
  const { container } = render(
    <FileDiffView file={file} comments={[]} viewMode="unified"
      onToggleViewed={noop} onAddComment={onAddComment} onUpdateComment={noop} onDeleteComment={noop}
      onAskAi={onAskAi} />,
  );
  const scope = within(container as HTMLElement);
  // Shift-click a line number opens the form on that line.
  const newLineCell = scope.getAllByText('1').find((el) => el.closest('tr')?.classList.contains('line-add'))!;
  fireEvent.mouseDown(newLineCell, { button: 0, shiftKey: true });
  fireEvent.change(scope.getByPlaceholderText('Leave a comment'), { target: { value: 'what?' } });
  fireEvent.click(scope.getByText('Ask AI'));
  expect(onAskAi).toHaveBeenCalledWith(
    { file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1, code: 'const a = 2;' },
    'what?',
  );
  expect(onAddComment).not.toHaveBeenCalled();
  expect(scope.queryByPlaceholderText('Leave a comment')).toBeNull();
});

test('without onAskAi the form has no Ask AI button', () => {
  const { container } = render(
    <FileDiffView file={file} comments={[]} viewMode="unified"
      onToggleViewed={noop} onAddComment={noop} onUpdateComment={noop} onDeleteComment={noop} />,
  );
  const scope = within(container as HTMLElement);
  fireEvent.click(scope.getByText('Comment on file'));
  expect(scope.queryByText('Ask AI')).toBeNull();
});

test('a draft for this file opens a prefilled comment form on its range', () => {
  const onAddComment = mock(noop);
  const onDraftConsumed = mock(noop);
  const { container } = render(
    <FileDiffView file={file} comments={[]} viewMode="unified"
      onToggleViewed={noop} onAddComment={onAddComment} onUpdateComment={noop} onDeleteComment={noop}
      draft={{ file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1, body: 'AI said so' }}
      onDraftConsumed={onDraftConsumed} />,
  );
  const scope = within(container as HTMLElement);
  const textarea = scope.getByPlaceholderText('Leave a comment') as HTMLTextAreaElement;
  expect(textarea.value).toBe('AI said so');
  expect(onDraftConsumed).toHaveBeenCalled();
  fireEvent.click(scope.getByText('Add comment'));
  expect(onAddComment).toHaveBeenCalledWith({ file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1, body: 'AI said so' });
});

test('a draft for another file is ignored', () => {
  const { container } = render(
    <FileDiffView file={file} comments={[]} viewMode="unified"
      onToggleViewed={noop} onAddComment={noop} onUpdateComment={noop} onDeleteComment={noop}
      draft={{ file: 'src/other.ts', side: 'new', startLine: 1, endLine: 1, body: 'x' }} onDraftConsumed={noop} />,
  );
  expect(within(container as HTMLElement).queryByPlaceholderText('Leave a comment')).toBeNull();
});
