import { expect, test, mock } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
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
  expect(container.textContent).toContain('Changed since last view');
  const checkbox = container.querySelector('input[aria-label="Viewed"]') as HTMLInputElement;
  fireEvent.click(checkbox);
  expect(onToggleViewed).toHaveBeenCalledWith('src/a.ts', true);
});

test('split mode renders old and new side by side', () => {
  const { container } = render(
    <FileDiffView file={file} comments={[]} viewMode="split"
      onToggleViewed={noop} onAddComment={noop} onUpdateComment={noop} onDeleteComment={noop} />,
  );
  expect(container.textContent).toContain('const a = 1;');
  expect(container.textContent).toContain('const a = 2;');
});
