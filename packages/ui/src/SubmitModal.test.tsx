import { expect, test, mock } from 'bun:test';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SubmitModal from './components/SubmitModal.tsx';

const noop = () => {};
const comments = [
  { id: 1, file: 'src/a.ts', side: 'new' as const, startLine: 1, endLine: 1, body: 'note one' },
];

const primary = (name: string) => screen.getByRole('button', { name });
const openMenu = () => fireEvent.click(screen.getByLabelText('Change review action'));

test('shows comment count and submits the default verdict with an overall comment', () => {
  const onSubmit = mock(noop);
  render(<SubmitModal comments={comments} onSubmit={onSubmit} onClose={noop} />);
  expect(screen.getByText('1 comment')).toBeTruthy();
  expect(screen.getByText('note one')).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText('Overall comment (optional)'), {
    target: { value: 'overall note' },
  });
  fireEvent.click(primary('Request changes'));
  expect(onSubmit).toHaveBeenCalledWith('request_changes', 'overall note');
});

test('with no comments the action is approve; empty overall comment becomes undefined', () => {
  const onSubmit = mock(noop);
  render(<SubmitModal comments={[]} onSubmit={onSubmit} onClose={noop} />);
  fireEvent.click(primary('Approve'));
  expect(onSubmit).toHaveBeenCalledWith('approve', undefined);
});

test('with comments the action defaults to request changes', () => {
  render(<SubmitModal comments={comments} onSubmit={noop} onClose={noop} />);
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  expect(primary('Request changes')).toBeTruthy();
});

test('the dropdown switches the action without submitting', () => {
  const onSubmit = mock(noop);
  render(<SubmitModal comments={comments} onSubmit={onSubmit} onClose={noop} />);
  openMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Approve' }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(primary('Approve'));
  expect(onSubmit).toHaveBeenCalledWith('approve', undefined);
});

test('the split button is styled as danger only while the action is request changes', () => {
  render(<SubmitModal comments={comments} onSubmit={noop} onClose={noop} />);
  expect(primary('Request changes').classList.contains('danger')).toBe(true);
  expect(screen.getByLabelText('Change review action').classList.contains('danger')).toBe(true);
  openMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Approve' }));
  expect(primary('Approve').classList.contains('danger')).toBe(false);
  expect(screen.getByLabelText('Change review action').classList.contains('danger')).toBe(false);
});

test('the overall comment textarea is focused when the modal opens', () => {
  render(<SubmitModal comments={[]} onSubmit={noop} onClose={noop} />);
  expect(document.activeElement).toBe(screen.getByPlaceholderText('Overall comment (optional)'));
});

test('cmd+enter submits from anywhere in the modal, not just the textarea', () => {
  const onSubmit = mock(noop);
  render(<SubmitModal comments={[]} onSubmit={onSubmit} onClose={noop} />);
  fireEvent.keyDown(screen.getByLabelText('Change review action'), { key: 'Enter', metaKey: true });
  expect(onSubmit).toHaveBeenCalledWith('approve', undefined);
});

test('cmd+enter in the overall comment textarea submits with the current verdict', () => {
  const onSubmit = mock(noop);
  render(<SubmitModal comments={[]} onSubmit={onSubmit} onClose={noop} />);
  const textarea = screen.getByPlaceholderText('Overall comment (optional)');
  fireEvent.change(textarea, { target: { value: 'ship it' } });
  fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
  expect(onSubmit).toHaveBeenCalledWith('approve', 'ship it');
});

test('failed submit shows error, re-enables, and keeps the modal open', async () => {
  const onSubmit = mock(() => Promise.reject(new Error('boom')));
  render(<SubmitModal comments={[]} onSubmit={onSubmit} onClose={noop} />);
  fireEvent.click(primary('Approve'));
  await waitFor(() => expect(screen.getByText(/Submit failed:/)).toBeTruthy());
  expect((primary('Approve') as HTMLButtonElement).disabled).toBe(false);
});

test('file-level comment location shows only the file path', () => {
  render(<SubmitModal
    comments={[{ id: 2, file: 'src/b.ts', body: 'file note' }]}
    onSubmit={noop} onClose={noop} />);
  expect(screen.getByText('src/b.ts')).toBeTruthy();
});
