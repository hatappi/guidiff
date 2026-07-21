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
