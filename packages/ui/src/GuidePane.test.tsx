import { expect, test, mock } from 'bun:test';
import { fireEvent, render, within } from '@testing-library/react';
import type { Guide } from '@guidiff/schema';
import GuidePane from './components/GuidePane.tsx';
import { buildSectionGroups, type FileWithState } from './sections.ts';

const file = (path: string): FileWithState => ({
  path, status: 'modified', binary: false, hunks: [], patch: 'x',
  state: { viewed: false, changedSinceLastView: false },
});

const guide: Guide = {
  version: 1, title: 'Add auth', summary: 'Adds JWT auth.',
  sections: [
    { id: 'core', title: 'Core middleware', description: 'Heart.', importance: 'core',
      anchors: [{ file: 'src/auth.ts', side: 'new' }] },
    { id: 'lockfile', title: 'Lockfile churn', description: 'Auto.', importance: 'low-signal',
      anchors: [{ file: 'bun.lock', side: 'new' }] },
  ],
};
const files = [file('src/auth.ts'), file('bun.lock'), file('extra.ts')];
const groups = buildSectionGroups(guide, files);
const noop = () => {};

function renderPane(overrides: Partial<Parameters<typeof GuidePane>[0]> = {}) {
  return render(
    <GuidePane
      title={guide.title} summary={guide.summary} groups={groups}
      reviewedSections={[]} fileViewed={{}}
      onToggleSection={noop} onJump={noop} onSettle={noop}
      {...overrides}
    />,
  );
}

test('renders one snap card per group in guide order with position meta', () => {
  const { container } = renderPane();
  const cards = Array.from(container.querySelectorAll('.guide-card'));
  expect(cards.map((c) => c.id)).toEqual([
    'guide-card-core', 'guide-card-lockfile', 'guide-card-other-changes',
  ]);
  expect(within(cards[0] as HTMLElement).getByText('1 / 3')).toBeTruthy();
  expect(within(cards[2] as HTMLElement).getByText('Other changes')).toBeTruthy();
});

test('pane header shows guide title and summary', () => {
  const { container } = renderPane();
  const scope = within(container as HTMLElement);
  expect(scope.getByText('Add auth')).toBeTruthy();
  expect(scope.getByText('Adds JWT auth.')).toBeTruthy();
});

test('section checkbox toggles reviewed', () => {
  const onToggleSection = mock(noop);
  const { container } = renderPane({ onToggleSection });
  const first = container.querySelector('#guide-card-core') as HTMLElement;
  fireEvent.click(within(first).getByRole('checkbox'));
  expect(onToggleSection).toHaveBeenCalledWith('core', true);
});

test('anchor click jumps to file', () => {
  const onJump = mock(noop);
  const { container } = renderPane({ onJump });
  const first = container.querySelector('#guide-card-core') as HTMLElement;
  fireEvent.click(within(first).getByText('src/auth.ts'));
  expect(onJump).toHaveBeenCalledWith('src/auth.ts', undefined);
});

test('all-anchor-files-viewed shows the done mark', () => {
  const { container } = renderPane({ fileViewed: { 'src/auth.ts': true } });
  const first = container.querySelector('#guide-card-core') as HTMLElement;
  expect(within(first).getByText('All files viewed')).toBeTruthy();
});
