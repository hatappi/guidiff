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

  test('overview panel starts open and the navbar button toggles it', async () => {
    payloadToServe = guidedPayload;
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.overview-panel')).toBeTruthy());
    expect(within(container.querySelector('.overview-panel') as HTMLElement).getByText('Sum.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Overview/ }));
    expect(container.querySelector('.overview-panel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Overview/ }));
    expect(container.querySelector('.overview-panel')).toBeTruthy();
  });

  test('without a guide there is no overview toggle button', async () => {
    payloadToServe = payload;
    render(<App />);
    await waitFor(() => expect(screen.getByText('working tree')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Overview/ })).toBeNull();
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
