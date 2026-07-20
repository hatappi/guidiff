import { describe, expect, test, mock } from 'bun:test';
import { render, screen, waitFor } from '@testing-library/react';
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

mock.module('./api.ts', () => ({
  fetchReview: async () => payload,
  createComment: async () => ({ id: 1 }),
  updateComment: async () => ({}),
  deleteComment: async () => ({}),
  setFileViewed: async () => ({}),
  setSectionReviewed: async () => ({}),
  submitReview: async () => ({}),
  cancelReview: async () => ({}),
}));

describe('App', () => {
  test('loads review payload and shows target and files', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('working tree')).toBeTruthy());
    expect(screen.getByText('src/a.ts')).toBeTruthy();
    expect(screen.getByText('const a = 2;')).toBeTruthy();
  });
});
