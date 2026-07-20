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
const noopRef = { current: null };

function renderPane(overrides: Partial<Parameters<typeof GuidePane>[0]> = {}) {
  return render(
    <GuidePane
      title={guide.title} summary={guide.summary} groups={groups}
      reviewedSections={[]} fileViewed={{}}
      onToggleSection={noop} onJump={noop}
      trackRef={noopRef} onStep={noop}
      {...overrides}
    />,
  );
}

// A guide where two sections both anchor the same file: buildSectionGroups
// assigns ownership to the first section only, so the second section's
// group.files excludes it even though its anchors still list it.
const dupGuide: Guide = {
  version: 1, title: 'Dup', summary: 'Two sections anchor the same file.',
  sections: [
    { id: 'first', title: 'First section', description: 'Owns it.', importance: 'core',
      anchors: [{ file: 'shared.ts', side: 'new' }] },
    { id: 'second', title: 'Second section', description: 'Also references it.', importance: 'supporting',
      anchors: [{ file: 'shared.ts', side: 'new' }, { file: 'only-second.ts', side: 'new' }] },
  ],
};
const dupFiles = [file('shared.ts'), file('only-second.ts')];
const dupGroups = buildSectionGroups(dupGuide, dupFiles);

test('renders one card per group in guide order with position meta, inside a viewport/track', () => {
  const { container } = renderPane();
  expect(container.querySelector('.guide-viewport')).toBeTruthy();
  expect(container.querySelector('.guide-viewport .guide-track')).toBeTruthy();
  const cards = Array.from(container.querySelectorAll('.guide-track > .guide-card'));
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

test('a file anchored by two sections is shown only on the first (owning) section card', () => {
  const { container } = render(
    <GuidePane
      title={dupGuide.title} summary={dupGuide.summary} groups={dupGroups}
      reviewedSections={[]} fileViewed={{}}
      onToggleSection={noop} onJump={noop}
      trackRef={noopRef} onStep={noop}
    />,
  );
  const first = container.querySelector('#guide-card-first') as HTMLElement;
  const second = container.querySelector('#guide-card-second') as HTMLElement;
  expect(within(first).getByText('shared.ts')).toBeTruthy();
  expect(within(second).queryByText('shared.ts')).toBeNull();
  expect(within(second).getByText('only-second.ts')).toBeTruthy();
});

test('wheel down on the viewport steps to the next section once, then ignores repeats within the cooldown', () => {
  const onStep = mock(noop);
  const { container } = renderPane({ onStep });
  const viewport = container.querySelector('.guide-viewport') as HTMLElement;
  fireEvent.wheel(viewport, { deltaY: 100 });
  expect(onStep).toHaveBeenCalledTimes(1);
  expect(onStep).toHaveBeenCalledWith('next');
  fireEvent.wheel(viewport, { deltaY: 100 });
  fireEvent.wheel(viewport, { deltaY: 100 });
  expect(onStep).toHaveBeenCalledTimes(1);
});

test('wheel up on the viewport steps to the previous section', () => {
  const onStep = mock(noop);
  const { container } = renderPane({ onStep });
  const viewport = container.querySelector('.guide-viewport') as HTMLElement;
  fireEvent.wheel(viewport, { deltaY: -100 });
  expect(onStep).toHaveBeenCalledTimes(1);
  expect(onStep).toHaveBeenCalledWith('prev');
});
