import { expect, test, mock } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ChatMessage } from '@guidiff/schema';
import ChatPanel from './components/ChatPanel.tsx';

const noop = () => {};
const base = { streaming: false, onSend: noop, onAbort: noop, onClear: noop, onClose: noop, onJump: noop, onAddAsComment: noop };

const q: ChatMessage = {
  id: 1, role: 'user', content: 'why?', status: 'done',
  context: { file: 'src/a.ts', side: 'new', startLine: 12, endLine: 14, code: 'a\nb' },
};
const a: ChatMessage = { id: 2, role: 'assistant', content: 'Because **x**.', status: 'done' };

test('renders the question with a context chip, the quoted code and the markdown answer', () => {
  const onJump = mock(noop);
  const { container } = render(<ChatPanel {...base} messages={[q, a]} onJump={onJump} />);
  fireEvent.click(screen.getByText('src/a.ts:12-14'));
  expect(onJump).toHaveBeenCalledWith('src/a.ts');
  // getByText normalises whitespace, so read the <pre> directly.
  expect(container.querySelector('.chat-quote')?.textContent).toBe('a\nb');
  expect(screen.getByText('x').tagName).toBe('STRONG');
});

test('cmd+enter sends the trimmed input and clears it; blank input does nothing', () => {
  const onSend = mock(noop);
  render(<ChatPanel {...base} messages={[]} onSend={onSend} />);
  const input = screen.getByPlaceholderText('Ask about this diff…') as HTMLTextAreaElement;
  fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
  expect(onSend).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '  hi  ' } });
  fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
  expect(onSend).toHaveBeenCalledWith('hi');
  expect(input.value).toBe('');
});

test('while streaming, Send is disabled and Stop aborts', () => {
  const onAbort = mock(noop);
  render(<ChatPanel {...base} streaming messages={[q, { ...a, content: 'Bec', status: 'streaming' }]} onAbort={onAbort} />);
  expect((screen.getByText('Send') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('Stop'));
  expect(onAbort).toHaveBeenCalled();
});

test('Add as comment appears only for finished answers to line-anchored questions', () => {
  const onAddAsComment = mock(noop);
  const fileOnlyQ: ChatMessage = { id: 3, role: 'user', content: 'and?', status: 'done', context: { file: 'src/a.ts' } };
  const fileOnlyA: ChatMessage = { id: 4, role: 'assistant', content: 'ok', status: 'done' };
  const freeQ: ChatMessage = { id: 5, role: 'user', content: 'hm', status: 'done' };
  const freeA: ChatMessage = { id: 6, role: 'assistant', content: 'yes', status: 'done' };
  render(<ChatPanel {...base} messages={[q, a, fileOnlyQ, fileOnlyA, freeQ, freeA]} onAddAsComment={onAddAsComment} />);
  const buttons = screen.getAllByText('Add as comment');
  expect(buttons.length).toBe(1);
  fireEvent.click(buttons[0]!);
  expect(onAddAsComment).toHaveBeenCalledWith(a, q);
});

test('stopped and failed answers say so', () => {
  render(<ChatPanel {...base} messages={[
    q, { ...a, status: 'aborted' },
    { ...q, id: 3 }, { id: 4, role: 'assistant', content: '', status: 'error', error: 'claude exited with code 1' },
  ]} />);
  expect(screen.getByText('(stopped)')).toBeTruthy();
  expect(screen.getByText('claude exited with code 1')).toBeTruthy();
});

test('the error style stays on the note, not the message wrapper', () => {
  const { container } = render(<ChatPanel {...base} messages={[
    q, { id: 4, role: 'assistant', content: '', status: 'error', error: 'claude exited with code 1' },
  ]} />);
  // .chat-error must be the note div only — the wrapper uses chat-status-error.
  expect(container.querySelectorAll('.chat-error').length).toBe(1);
  expect(container.querySelector('.chat-msg.chat-error')).toBeFalsy();
  expect(container.querySelector('.chat-msg.chat-status-error')).toBeTruthy();
});

test('Clear is disabled on an empty transcript; Clear and close call their handlers', () => {
  const onClear = mock(noop);
  const onClose = mock(noop);
  const { rerender } = render(<ChatPanel {...base} messages={[]} onClear={onClear} onClose={onClose} />);
  expect((screen.getByText('Clear') as HTMLButtonElement).disabled).toBe(true);
  rerender(<ChatPanel {...base} messages={[q, a]} onClear={onClear} onClose={onClose} />);
  fireEvent.click(screen.getByText('Clear'));
  fireEvent.click(screen.getByLabelText('Close Ask AI'));
  expect(onClear).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});
