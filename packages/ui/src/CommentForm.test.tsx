import { expect, test, mock } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import CommentForm from './components/CommentForm.tsx';

const noop = () => {};

test('cmd+enter submits the trimmed body', () => {
  const onSubmit = mock(noop);
  render(<CommentForm onSubmit={onSubmit} onCancel={noop} />);
  const textarea = screen.getByPlaceholderText('Leave a comment');
  fireEvent.change(textarea, { target: { value: '  looks off  ' } });
  fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
  expect(onSubmit).toHaveBeenCalledWith('looks off');
});

test('the suggest button appears only when the range is suggestable', () => {
  const { rerender } = render(<CommentForm onSubmit={noop} onCancel={noop} />);
  expect(screen.queryByText('± Suggest a change')).toBeNull();
  rerender(<CommentForm suggestionBase={['const a = 1;']} onSubmit={noop} onCancel={noop} />);
  expect(screen.getByText('± Suggest a change')).toBeTruthy();
});

test('suggesting prefills the current lines and submits body plus suggestion', () => {
  const onSubmit = mock(noop);
  render(<CommentForm suggestionBase={['line one', 'line two']} onSubmit={onSubmit} onCancel={noop} />);
  fireEvent.click(screen.getByText('± Suggest a change'));
  const editor = screen.getByLabelText('Suggested change') as HTMLTextAreaElement;
  expect(editor.value).toBe('line one\nline two');
  fireEvent.change(editor, { target: { value: 'line one!' } });
  fireEvent.change(screen.getByPlaceholderText('Leave a comment'), { target: { value: 'squash these' } });
  fireEvent.click(screen.getByText('Add comment'));
  expect(onSubmit).toHaveBeenCalledWith('squash these', 'line one!');
});

test('removing the suggestion submits the body alone', () => {
  const onSubmit = mock(noop);
  render(
    <CommentForm initialBody="note" initialSuggestion="old" suggestionBase={['x']}
      onSubmit={onSubmit} onCancel={noop} />,
  );
  expect((screen.getByLabelText('Suggested change') as HTMLTextAreaElement).value).toBe('old');
  fireEvent.click(screen.getByText('Remove'));
  expect(screen.queryByLabelText('Suggested change')).toBeNull();
  fireEvent.click(screen.getByText('Save'));
  expect(onSubmit).toHaveBeenCalledWith('note');
});

test('a suggestion alone submits with an empty body', () => {
  const onSubmit = mock(noop);
  render(<CommentForm suggestionBase={['line one']} onSubmit={onSubmit} onCancel={noop} />);
  fireEvent.click(screen.getByText('± Suggest a change'));
  fireEvent.click(screen.getByText('Add comment'));
  expect(onSubmit).toHaveBeenCalledWith('', 'line one');
});

test('removing the suggestion disables submitting an empty comment again', () => {
  const onSubmit = mock(noop);
  render(<CommentForm suggestionBase={['line one']} onSubmit={onSubmit} onCancel={noop} />);
  fireEvent.click(screen.getByText('± Suggest a change'));
  fireEvent.click(screen.getByText('Remove'));
  fireEvent.click(screen.getByText('Add comment'));
  expect(onSubmit).not.toHaveBeenCalled();
});

test('cmd+enter inside the suggestion editor submits both fields', () => {
  const onSubmit = mock(noop);
  render(<CommentForm initialBody="note" suggestionBase={['x']} onSubmit={onSubmit} onCancel={noop} />);
  fireEvent.click(screen.getByText('± Suggest a change'));
  fireEvent.keyDown(screen.getByLabelText('Suggested change'), { key: 'Enter', metaKey: true });
  expect(onSubmit).toHaveBeenCalledWith('note', 'x');
});

test('ctrl+enter submits; plain enter and empty body do not', () => {
  const onSubmit = mock(noop);
  render(<CommentForm onSubmit={onSubmit} onCancel={noop} />);
  const textarea = screen.getByPlaceholderText('Leave a comment');
  fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.change(textarea, { target: { value: 'hi' } });
  fireEvent.keyDown(textarea, { key: 'Enter' });
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
  expect(onSubmit).toHaveBeenCalledWith('hi');
});
