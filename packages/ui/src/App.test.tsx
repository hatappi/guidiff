import { describe, expect, test, mock } from 'bun:test';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReviewPayload } from '@guidiff/schema';
import App from './App.tsx';

const payload: ReviewPayload = {
  target: 'working tree',
  guide: null,
  files: [
    {
      path: 'src/a.ts', status: 'modified', binary: false,
      hunks: [{ header: '@@ -1,1 +1,1 @@', lines: [
        { type: 'del', oldLine: 1, text: 'const a = 1;' },
        { type: 'add', newLine: 1, text: 'const a = 2;' },
      ] }],
      patch: 'x',
      state: { viewed: false, changedSinceLastView: false },
    },
  ],
  comments: [],
  reviewedSections: [],
};

let payloadToServe: ReviewPayload;
mock.module('./api.ts', () => ({
  fetchReview: async () => payloadToServe,
  createComment: async () => ({ id: 1 }),
  updateComment: async () => ({}),
  deleteComment: async () => ({}),
  setFileViewed: async () => ({}),
  setSectionReviewed: async () => ({}),
  submitReview: async () => ({}),
  cancelReview: async () => ({}),
}));

const guidedPayload: ReviewPayload = {
  target: 'working tree',
  guide: {
    version: 1, title: 'G', summary: 'Sum.',
    sections: [
      { id: 'core', title: 'Core stuff', description: 'd', importance: 'core',
        anchors: [{ file: 'src/a.ts', side: 'new' }] },
    ],
  },
  files: [
    ...payload.files,
    { path: 'src/extra.ts', status: 'modified', binary: false,
      hunks: [{ header: '@@ -1,1 +1,1 @@', lines: [{ type: 'add', newLine: 1, text: 'const x = 9;' }] }],
      patch: 'y', state: { viewed: false, changedSinceLastView: false } },
  ],
  comments: [],
  reviewedSections: [],
};

describe('App', () => {
  test('loads review payload and shows target and files', async () => {
    payloadToServe = payload;
    render(<App />);
    await waitFor(() => expect(screen.getByText('working tree')).toBeTruthy());
    expect(screen.getAllByText('src/a.ts').length).toBeGreaterThan(0);
    expect(screen.getByText('const a = 2;')).toBeTruthy();
  });

  test('with a guide, each section renders as a row pairing its guide block with its diffs', async () => {
    payloadToServe = guidedPayload;
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#section-core')).toBeTruthy());

    const core = container.querySelector('#section-core') as HTMLElement;
    expect(core.classList.contains('section-row')).toBe(true);
    expect(core.querySelector('#guide-block-core')).toBeTruthy();
    expect(within(core).getByText('Core stuff')).toBeTruthy();
    expect(within(core).getAllByText('src/a.ts').length).toBeGreaterThan(0);

    const other = container.querySelector('#section-other-changes') as HTMLElement;
    expect(other).toBeTruthy();
    expect(other.querySelector('#guide-block-other-changes')).toBeTruthy();
    expect(within(other).getAllByText('src/extra.ts').length).toBeGreaterThan(0);
  });

  test('overview panel starts open and clicking its title row toggles it', async () => {
    payloadToServe = guidedPayload;
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.overview-panel')).toBeTruthy());
    expect(within(container.querySelector('.overview-panel') as HTMLElement).getByText('Sum.')).toBeTruthy();

    const toggle = screen.getByRole('button', { name: 'G' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);
    expect(screen.queryByText('Sum.')).toBeNull();
    // タイトル行は残る
    expect(container.querySelector('.overview-panel')).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);
    expect(screen.getByText('Sum.')).toBeTruthy();
  });

  test('without a guide the overview panel is not rendered', async () => {
    payloadToServe = payload;
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText('working tree')).toBeTruthy());
    expect(container.querySelector('.overview-panel')).toBeNull();
  });

  const mkFile = (path: string, viewed = false): ReviewPayload['files'][number] => ({
    path, status: 'modified', binary: false,
    hunks: [{ header: '@@ -1,1 +1,1 @@', lines: [{ type: 'add', newLine: 1, text: 'x' }] }],
    patch: path,
    state: { viewed, changedSinceLastView: false },
  });

  const syncPayload = (viewed: boolean, reviewedSections: string[]): ReviewPayload => ({
    target: 'working tree',
    guide: {
      version: 1, title: 'G', summary: 'Sum.',
      sections: [
        { id: 'core', title: 'Core stuff', description: 'd', importance: 'core',
          anchors: [{ file: 'src/a.ts', side: 'new' }, { file: 'src/b.ts', side: 'new' }] },
      ],
    },
    files: [mkFile('src/a.ts', viewed), mkFile('src/b.ts', viewed)],
    comments: [],
    reviewedSections,
  });

  const sectionCheckbox = (container: HTMLElement) =>
    within(container.querySelector('#guide-block-core') as HTMLElement).getByRole('checkbox') as HTMLInputElement;
  const fileCheckbox = (path: string) =>
    within(document.getElementById(`file-${path}`) as HTMLElement).getByLabelText('Viewed') as HTMLInputElement;

  test('checking a section marks all of its files viewed', async () => {
    payloadToServe = syncPayload(false, []);
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#section-core')).toBeTruthy());

    fireEvent.click(sectionCheckbox(container as HTMLElement));
    expect(fileCheckbox('src/a.ts').checked).toBe(true);
    expect(fileCheckbox('src/b.ts').checked).toBe(true);
    expect(screen.getByText('1 / 1 sections reviewed')).toBeTruthy();
  });

  test('unchecking a section marks all of its files unviewed', async () => {
    payloadToServe = syncPayload(true, ['core']);
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#section-core')).toBeTruthy());

    fireEvent.click(sectionCheckbox(container as HTMLElement));
    expect(fileCheckbox('src/a.ts').checked).toBe(false);
    expect(fileCheckbox('src/b.ts').checked).toBe(false);
    expect(screen.getByText('0 / 1 sections reviewed')).toBeTruthy();
  });

  test('viewing the last unviewed file auto-checks its section', async () => {
    payloadToServe = syncPayload(false, []);
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#section-core')).toBeTruthy());

    fireEvent.click(fileCheckbox('src/a.ts'));
    expect(sectionCheckbox(container as HTMLElement).checked).toBe(false);

    fireEvent.click(fileCheckbox('src/b.ts'));
    expect(sectionCheckbox(container as HTMLElement).checked).toBe(true);
    expect(screen.getByText('1 / 1 sections reviewed')).toBeTruthy();
  });

  test('unviewing a file unchecks its reviewed section, and load alone never checks it', async () => {
    // All files viewed from persisted state, but the section starts unreviewed:
    // loading must not auto-check it.
    payloadToServe = syncPayload(true, []);
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#section-core')).toBeTruthy());
    expect(sectionCheckbox(container as HTMLElement).checked).toBe(false);

    fireEvent.click(sectionCheckbox(container as HTMLElement));
    expect(sectionCheckbox(container as HTMLElement).checked).toBe(true);

    fireEvent.click(fileCheckbox('src/b.ts'));
    expect(sectionCheckbox(container as HTMLElement).checked).toBe(false);
    expect(fileCheckbox('src/a.ts').checked).toBe(true);
  });

  test('clicking an anchor jumps to the file element', async () => {
    payloadToServe = guidedPayload;
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#section-core')).toBeTruthy());

    const otherBlock = container.querySelector('#guide-block-other-changes') as HTMLElement;
    const target = document.getElementById('file-src/extra.ts') as HTMLElement | null;
    const scrollIntoView = mock(() => {});
    if (target) target.scrollIntoView = scrollIntoView;
    fireEvent.click(within(otherBlock).getByText('src/extra.ts'));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    // Every section stays rendered; anchors never switch views.
    expect(container.querySelector('#section-core')).toBeTruthy();
    expect(container.querySelector('#section-other-changes')).toBeTruthy();
  });
});
