import { expect, test, mock } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Guide } from '@guidiff/schema';
import GuidePane from './components/GuidePane.tsx';

const guide: Guide = {
  version: 1,
  title: 'Add auth',
  summary: 'Adds JWT auth end to end.',
  sections: [
    { id: 'core', title: 'Core middleware', description: 'The heart of the change.', importance: 'core',
      anchors: [{ file: 'src/auth.ts', side: 'new' }] },
    { id: 'wiring', title: 'Router wiring', description: 'Hook it up.', importance: 'supporting',
      anchors: [{ file: 'src/app.ts', lines: [12, 45] as [number, number], side: 'new' }] },
    { id: 'lockfile', title: 'Lockfile churn', description: 'Auto-generated.', importance: 'low-signal',
      anchors: [{ file: 'bun.lock', side: 'new' }] },
  ],
};
const noop = () => {};

test('renders summary and sections in order with importance badges', () => {
  render(<GuidePane guide={guide} reviewedSections={[]} fileViewed={{}} activeFile={null}
    onToggleSection={noop} onJump={noop} />);
  expect(screen.getByText('Adds JWT auth end to end.')).toBeTruthy();
  const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
  expect(titles).toEqual(['Core middleware', 'Router wiring', 'Lockfile churn']);
});

test('anchor click jumps to file and line', () => {
  const onJump = mock(noop);
  render(<GuidePane guide={guide} reviewedSections={[]} fileViewed={{}} activeFile={null}
    onToggleSection={noop} onJump={onJump} />);
  fireEvent.click(screen.getByText('src/app.ts:12'));
  expect(onJump).toHaveBeenCalledWith('src/app.ts', 12);
});

test('section checkbox toggles reviewed', () => {
  const onToggleSection = mock(noop);
  render(<GuidePane guide={guide} reviewedSections={['core']} fileViewed={{}} activeFile={null}
    onToggleSection={onToggleSection} onJump={noop} />);
  const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
  expect(boxes[0]!.checked).toBe(true);
  fireEvent.click(boxes[1]!);
  expect(onToggleSection).toHaveBeenCalledWith('wiring', true);
});

test('section with all anchor files viewed gets done mark', () => {
  render(<GuidePane guide={guide} reviewedSections={[]} fileViewed={{ 'src/auth.ts': true }} activeFile={null}
    onToggleSection={noop} onJump={noop} />);
  expect(screen.getByText('All files viewed')).toBeTruthy();
});

test('low-signal sections are inside a collapsed details element', () => {
  render(<GuidePane guide={guide} reviewedSections={[]} fileViewed={{}} activeFile={null}
    onToggleSection={noop} onJump={noop} />);
  const details = document.querySelector('details.low-signal-group') as HTMLDetailsElement;
  expect(details).toBeTruthy();
  expect(details.open).toBe(false);
  expect(details.textContent).toContain('Lockfile churn');
});
