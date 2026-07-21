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

test('mousedown+mouseup on a line number opens form; submitting calls onAddComment with that line', () => {
  const onAddComment = mock(noop);
  render(<FileDiffView file={file} comments={[]} viewMode="unified"
    onToggleViewed={noop} onAddComment={onAddComment} onUpdateComment={noop} onDeleteComment={noop} />);
  fireEvent.mouseDown(screen.getByText('1'));
  fireEvent.mouseUp(document);
  fireEvent.change(screen.getByPlaceholderText('Leave a comment'), { target: { value: 'looks off' } });
  fireEvent.click(screen.getByText('Add comment'));
  expect(onAddComment).toHaveBeenCalledWith({
    file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1, body: 'looks off',
  });
});

test('dragging across line numbers selects a range', () => {
  const onAddComment = mock(noop);
  render(<FileDiffView file={file} comments={[]} viewMode="unified"
    onToggleViewed={noop} onAddComment={onAddComment} onUpdateComment={noop} onDeleteComment={noop} />);
  fireEvent.mouseDown(screen.getByText('1'));
  fireEvent.mouseEnter(screen.getByText('2'));
  fireEvent.mouseUp(document);
  fireEvent.change(screen.getByPlaceholderText('Leave a comment'), { target: { value: 'range' } });
  fireEvent.click(screen.getByText('Add comment'));
  expect(onAddComment).toHaveBeenCalledWith({
    file: 'src/a.ts', side: 'new', startLine: 1, endLine: 2, body: 'range',
  });
});

test('shift+mousedown extends an existing selection', () => {
  const onAddComment = mock(noop);
  render(<FileDiffView file={file} comments={[]} viewMode="unified"
    onToggleViewed={noop} onAddComment={onAddComment} onUpdateComment={noop} onDeleteComment={noop} />);
  fireEvent.mouseDown(screen.getByText('1'));
  fireEvent.mouseUp(document);
  fireEvent.mouseDown(screen.getByText('2'), { shiftKey: true });
  fireEvent.change(screen.getByPlaceholderText('Leave a comment'), { target: { value: 'range' } });
  fireEvent.click(screen.getByText('Add comment'));
  expect(onAddComment).toHaveBeenCalledWith({
    file: 'src/a.ts', side: 'new', startLine: 1, endLine: 2, body: 'range',
  });
});

test('clicking or dragging the code cell does nothing', () => {
  render(<FileDiffView file={file} comments={[]} viewMode="unified"
    onToggleViewed={noop} onAddComment={noop} onUpdateComment={noop} onDeleteComment={noop} />);
  fireEvent.click(screen.getByText('line one'));
  fireEvent.mouseDown(screen.getByText('line one'));
  fireEvent.mouseUp(document);
  expect(screen.queryByPlaceholderText('Leave a comment')).toBeNull();
});

test('split view: mousedown+mouseup on the left column line number comments the new side for context lines', () => {
  const splitFile = {
    path: 'src/b.ts', status: 'modified' as const, binary: false,
    hunks: [{ header: '@@ -3,1 +5,1 @@', lines: [
      { type: 'context' as const, oldLine: 3, newLine: 5, text: 'context line' },
    ] }],
    patch: 'x',
    state: { viewed: false, changedSinceLastView: false },
  };
  const onAddComment = mock(noop);
  render(<FileDiffView file={splitFile} comments={[]} viewMode="split"
    onToggleViewed={noop} onAddComment={onAddComment} onUpdateComment={noop} onDeleteComment={noop} />);
  fireEvent.mouseDown(screen.getByText('3'));
  fireEvent.mouseUp(document);
  fireEvent.change(screen.getByPlaceholderText('Leave a comment'), { target: { value: 'ctx note' } });
  fireEvent.click(screen.getByText('Add comment'));
  expect(onAddComment).toHaveBeenCalledWith({
    file: 'src/b.ts', side: 'new', startLine: 5, endLine: 5, body: 'ctx note',
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
