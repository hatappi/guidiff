import { expect, test, mock } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import FileDiffView from './components/FileDiffView.tsx';

const file = {
  path: 'src/a.ts', status: 'modified' as const, binary: false,
  hunks: [{ header: '@@ -1,2 +1,2 @@', lines: [
    { type: 'add' as const, newLine: 1, text: 'line one' },
    { type: 'add' as const, newLine: 2, text: 'line two' },
  ] }],
  patch: 'x',
  state: { viewed: false, changedSinceLastView: false },
};
const noop = () => {};

test('clicking a line opens form; submitting calls onAddComment with that line', () => {
  const onAddComment = mock(noop);
  render(<FileDiffView file={file} comments={[]} viewMode="unified"
    onToggleViewed={noop} onAddComment={onAddComment} onUpdateComment={noop} onDeleteComment={noop} />);
  fireEvent.click(screen.getByText('line one'));
  fireEvent.change(screen.getByPlaceholderText('Leave a comment'), { target: { value: 'looks off' } });
  fireEvent.click(screen.getByText('Add comment'));
  expect(onAddComment).toHaveBeenCalledWith({
    file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1, body: 'looks off',
  });
});

test('shift-click extends selection to a range', () => {
  const onAddComment = mock(noop);
  render(<FileDiffView file={file} comments={[]} viewMode="unified"
    onToggleViewed={noop} onAddComment={onAddComment} onUpdateComment={noop} onDeleteComment={noop} />);
  fireEvent.click(screen.getByText('line one'));
  fireEvent.click(screen.getByText('line two'), { shiftKey: true });
  fireEvent.change(screen.getByPlaceholderText('Leave a comment'), { target: { value: 'range' } });
  fireEvent.click(screen.getByText('Add comment'));
  expect(onAddComment).toHaveBeenCalledWith({
    file: 'src/a.ts', side: 'new', startLine: 1, endLine: 2, body: 'range',
  });
});

test('existing comments render with edit and delete', () => {
  const onDeleteComment = mock(noop);
  render(<FileDiffView file={file}
    comments={[{ id: 1, file: 'src/a.ts', side: 'new', startLine: 2, endLine: 2, body: 'existing note' }]}
    viewMode="unified"
    onToggleViewed={noop} onAddComment={noop} onUpdateComment={noop} onDeleteComment={onDeleteComment} />);
  expect(screen.getByText('existing note')).toBeTruthy();
  fireEvent.click(screen.getByText('Delete'));
  expect(onDeleteComment).toHaveBeenCalledWith(1);
});
