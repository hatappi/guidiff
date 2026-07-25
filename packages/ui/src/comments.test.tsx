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

const splitDragFile = {
  path: 'src/c.ts', status: 'modified' as const, binary: false,
  hunks: [{ header: '@@ -3,2 +5,2 @@', lines: [
    { type: 'del' as const, oldLine: 3, text: 'old three' },
    { type: 'del' as const, oldLine: 4, text: 'old four' },
    { type: 'add' as const, newLine: 5, text: 'new five' },
    { type: 'add' as const, newLine: 6, text: 'new six' },
  ] }],
  patch: 'x',
  state: { viewed: false, changedSinceLastView: false },
};

test('split view: dragging down the right column selects a range on the new side', () => {
  const onAddComment = mock(noop);
  render(<FileDiffView file={splitDragFile} comments={[]} viewMode="split"
    onToggleViewed={noop} onAddComment={onAddComment} onUpdateComment={noop} onDeleteComment={noop} />);
  fireEvent.mouseDown(screen.getByText('5'));
  fireEvent.mouseEnter(screen.getByText('6'));
  fireEvent.mouseUp(document);
  fireEvent.change(screen.getByPlaceholderText('Leave a comment'), { target: { value: 'both lines' } });
  fireEvent.click(screen.getByText('Add comment'));
  expect(onAddComment).toHaveBeenCalledWith({
    file: 'src/c.ts', side: 'new', startLine: 5, endLine: 6, body: 'both lines',
  });
});

test('split view: dragging across sides does not extend the selection', () => {
  const onAddComment = mock(noop);
  render(<FileDiffView file={splitDragFile} comments={[]} viewMode="split"
    onToggleViewed={noop} onAddComment={onAddComment} onUpdateComment={noop} onDeleteComment={noop} />);
  fireEvent.mouseDown(screen.getByText('3'));
  fireEvent.mouseEnter(screen.getByText('6'));
  fireEvent.mouseUp(document);
  fireEvent.change(screen.getByPlaceholderText('Leave a comment'), { target: { value: 'old only' } });
  fireEvent.click(screen.getByText('Add comment'));
  expect(onAddComment).toHaveBeenCalledWith({
    file: 'src/c.ts', side: 'old', startLine: 3, endLine: 3, body: 'old only',
  });
});

test('suggesting a change on selected lines adds a comment carrying the suggestion', () => {
  const onAddComment = mock(noop);
  render(<FileDiffView file={file} comments={[]} viewMode="unified"
    onToggleViewed={noop} onAddComment={onAddComment} onUpdateComment={noop} onDeleteComment={noop} />);
  fireEvent.mouseDown(screen.getByText('1'));
  fireEvent.mouseEnter(screen.getByText('2'));
  fireEvent.mouseUp(document);
  fireEvent.click(screen.getByText('± Suggest a change'));
  const editor = screen.getByLabelText('Suggested change') as HTMLTextAreaElement;
  expect(editor.value).toBe('line one\nline two');
  fireEvent.change(editor, { target: { value: 'line one and two' } });
  fireEvent.change(screen.getByPlaceholderText('Leave a comment'), { target: { value: 'merge them' } });
  fireEvent.click(screen.getByText('Add comment'));
  expect(onAddComment).toHaveBeenCalledWith({
    file: 'src/a.ts', side: 'new', startLine: 1, endLine: 2,
    body: 'merge them', suggestion: 'line one and two',
  });
});

test('old-side selections cannot be suggested', () => {
  render(<FileDiffView file={splitDragFile} comments={[]} viewMode="split"
    onToggleViewed={noop} onAddComment={noop} onUpdateComment={noop} onDeleteComment={noop} />);
  fireEvent.mouseDown(screen.getByText('3'));
  fireEvent.mouseUp(document);
  expect(screen.getByPlaceholderText('Leave a comment')).toBeTruthy();
  expect(screen.queryByText('± Suggest a change')).toBeNull();
});

test('a comment with a suggestion renders the current lines above the replacement', () => {
  render(<FileDiffView file={file}
    comments={[{
      id: 1, file: 'src/a.ts', side: 'new', startLine: 1, endLine: 2,
      body: 'merge them', suggestion: 'line one and two',
    }]}
    viewMode="unified"
    onToggleViewed={noop} onAddComment={noop} onUpdateComment={noop} onDeleteComment={noop} />);
  expect(screen.getByText('Suggested change')).toBeTruthy();
  const rows = [...document.querySelectorAll('.suggestion-diff tr')];
  expect(rows.map((r) => [r.className, r.textContent])).toEqual([
    ['line-del', 'line one'],
    ['line-del', 'line two'],
    ['line-add', 'line one and two'],
  ]);
});

test('editing a comment reports the suggestion alongside the body', () => {
  const onUpdateComment = mock(noop);
  render(<FileDiffView file={file}
    comments={[{
      id: 7, file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1,
      body: 'note', suggestion: 'line ONE',
    }]}
    viewMode="unified"
    onToggleViewed={noop} onAddComment={noop} onUpdateComment={onUpdateComment} onDeleteComment={noop} />);
  fireEvent.click(screen.getByText('Edit'));
  fireEvent.change(screen.getByLabelText('Suggested change'), { target: { value: 'line 1' } });
  fireEvent.click(screen.getByText('Save'));
  expect(onUpdateComment).toHaveBeenCalledWith(7, 'note', 'line 1');
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

test('Comment on file button adds a file-level comment', () => {
  const onAddComment = mock(noop);
  render(<FileDiffView file={file} comments={[]} viewMode="unified"
    onToggleViewed={noop} onAddComment={onAddComment} onUpdateComment={noop} onDeleteComment={noop} />);
  fireEvent.click(screen.getByText('Comment on file'));
  fireEvent.change(screen.getByPlaceholderText('Leave a comment'), { target: { value: 'overall note' } });
  fireEvent.click(screen.getByText('Add comment'));
  expect(onAddComment).toHaveBeenCalledWith({ file: 'src/a.ts', body: 'overall note' });
});

test('Comment on file form opens as a popover inside the sticky file header', () => {
  render(<FileDiffView file={file} comments={[]} viewMode="unified"
    onToggleViewed={noop} onAddComment={noop} onUpdateComment={noop} onDeleteComment={noop} />);
  fireEvent.click(screen.getByText('Comment on file'));
  const textarea = screen.getByPlaceholderText('Leave a comment');
  const popover = textarea.closest('.file-comment-popover');
  expect(popover).not.toBeNull();
  expect(popover?.closest('.file-header')).not.toBeNull();
});

test('cancelling the file comment popover closes it', () => {
  render(<FileDiffView file={file} comments={[]} viewMode="unified"
    onToggleViewed={noop} onAddComment={noop} onUpdateComment={noop} onDeleteComment={noop} />);
  fireEvent.click(screen.getByText('Comment on file'));
  fireEvent.click(screen.getByText('Cancel'));
  expect(screen.queryByPlaceholderText('Leave a comment')).toBeNull();
});

test('file-level comments render above the diff with a File label', () => {
  render(<FileDiffView file={file}
    comments={[{ id: 1, file: 'src/a.ts', body: 'file note' }]}
    viewMode="unified"
    onToggleViewed={noop} onAddComment={noop} onUpdateComment={noop} onDeleteComment={noop} />);
  expect(screen.getByText('file note')).toBeTruthy();
  expect(screen.getByText('File')).toBeTruthy();
});

test('viewed file hides the Comment on file button and file comments', () => {
  const viewedFile = { ...file, state: { viewed: true, changedSinceLastView: false } };
  render(<FileDiffView file={viewedFile}
    comments={[{ id: 1, file: 'src/a.ts', body: 'file note' }]}
    viewMode="unified"
    onToggleViewed={noop} onAddComment={noop} onUpdateComment={noop} onDeleteComment={noop} />);
  expect(screen.queryByText('Comment on file')).toBeNull();
  expect(screen.queryByText('file note')).toBeNull();
});

test('right-clicking a line number does not start a selection', () => {
  render(<FileDiffView file={file} comments={[]} viewMode="unified"
    onToggleViewed={noop} onAddComment={noop} onUpdateComment={noop} onDeleteComment={noop} />);
  fireEvent.mouseDown(screen.getByText('1'), { button: 2 });
  fireEvent.mouseUp(document);
  expect(screen.queryByPlaceholderText('Leave a comment')).toBeNull();
});
