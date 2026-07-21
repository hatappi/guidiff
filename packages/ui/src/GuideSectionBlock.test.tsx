import { expect, test, mock } from 'bun:test';
import { fireEvent, render, within } from '@testing-library/react';
import type { GuideSection } from '@guidiff/schema';
import GuideSectionBlock from './components/GuideSectionBlock.tsx';

const section: GuideSection = {
  id: 'core', title: 'Core middleware', description: 'Heart of the change.', importance: 'core',
  anchors: [{ file: 'src/auth.ts', side: 'new', lines: [12, 20] }],
};
const noop = () => {};

function renderBlock(overrides: Partial<Parameters<typeof GuideSectionBlock>[0]> = {}) {
  return render(
    <GuideSectionBlock
      section={section} position="1 / 3" reviewed={false}
      files={[{ path: 'src/auth.ts', line: 12 }]} allViewed={false}
      onToggleSection={noop} onJump={noop}
      {...overrides}
    />,
  );
}

test('renders position, title, description and importance badge', () => {
  const { container } = renderBlock();
  const block = container.querySelector('#guide-block-core') as HTMLElement;
  expect(block).toBeTruthy();
  expect(block.classList.contains('guide-block')).toBe(true);
  const scope = within(block);
  expect(scope.getByText('1 / 3')).toBeTruthy();
  expect(scope.getByText('Core middleware')).toBeTruthy();
  expect(scope.getByText('Heart of the change.')).toBeTruthy();
  expect(scope.getByText('Core')).toBeTruthy();
});

test('checkbox toggles reviewed with the section id', () => {
  const onToggleSection = mock(noop);
  const { container } = renderBlock({ onToggleSection });
  fireEvent.click(within(container as HTMLElement).getByRole('checkbox'));
  expect(onToggleSection).toHaveBeenCalledWith('core', true);
});

test('anchor click jumps to file and line', () => {
  const onJump = mock(noop);
  const { container } = renderBlock({ onJump });
  fireEvent.click(within(container as HTMLElement).getByText('src/auth.ts:12'));
  expect(onJump).toHaveBeenCalledWith('src/auth.ts', 12);
});

test('anchor without a line renders the bare path', () => {
  const onJump = mock(noop);
  const { container } = renderBlock({ files: [{ path: 'src/auth.ts' }], onJump });
  fireEvent.click(within(container as HTMLElement).getByText('src/auth.ts'));
  expect(onJump).toHaveBeenCalledWith('src/auth.ts', undefined);
});

test('allViewed shows the done mark', () => {
  const { container } = renderBlock({ allViewed: true });
  expect(within(container as HTMLElement).getByText('All files viewed')).toBeTruthy();
});
