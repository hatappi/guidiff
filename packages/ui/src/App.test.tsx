import { describe, expect, test, mock } from 'bun:test';
import { render, screen, waitFor, within } from '@testing-library/react';
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

  test('with a guide, files render grouped under section headers incl. other-changes', async () => {
    payloadToServe = guidedPayload;
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#section-core')).toBeTruthy());
    const core = container.querySelector('#section-core') as HTMLElement;
    expect(within(core).getByText('Core stuff')).toBeTruthy();
    expect(within(core).getAllByText('src/a.ts').length).toBeGreaterThan(0);
    const other = container.querySelector('#section-other-changes') as HTMLElement;
    expect(other).toBeTruthy();
    expect(within(other).getAllByText('src/extra.ts').length).toBeGreaterThan(0);
    // guide cards on the left
    expect(container.querySelector('#guide-card-core')).toBeTruthy();
  });
});
