import { expect, test, mock } from 'bun:test';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SubmitModal from './components/SubmitModal.tsx';

const noop = () => {};
const comments = [
  { id: 1, file: 'src/a.ts', side: 'new' as const, startLine: 1, endLine: 1, body: 'note one' },
];

test('shows comment count and submits verdict with overall comment', () => {
  const onSubmit = mock(noop);
  render(<SubmitModal comments={comments} onSubmit={onSubmit} onClose={noop} />);
  expect(screen.getByText('1 comment')).toBeTruthy();
  expect(screen.getByText('note one')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Request changes'));
  fireEvent.change(screen.getByPlaceholderText('Overall comment (optional)'), {
    target: { value: 'overall note' },
  });
  fireEvent.click(screen.getByText('Submit review'));
  expect(onSubmit).toHaveBeenCalledWith('request_changes', 'overall note');
});

test('approve is default verdict; empty overall comment becomes undefined', () => {
  const onSubmit = mock(noop);
  render(<SubmitModal comments={[]} onSubmit={onSubmit} onClose={noop} />);
  fireEvent.click(screen.getByText('Submit review'));
  expect(onSubmit).toHaveBeenCalledWith('approve', undefined);
});

test('failed submit shows error, re-enables, and keeps the modal open', async () => {
  const onSubmit = mock(() => Promise.reject(new Error('boom')));
  render(<SubmitModal comments={[]} onSubmit={onSubmit} onClose={noop} />);
  fireEvent.click(screen.getByText('Submit review'));
  await waitFor(() => expect(screen.getByText(/Submit failed:/)).toBeTruthy());
  const button = screen.getByText('Submit review') as HTMLButtonElement;
  expect(button.disabled).toBe(false);
});
