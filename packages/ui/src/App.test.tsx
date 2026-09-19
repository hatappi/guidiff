import { describe, expect, test, mock } from 'bun:test';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ChatContext, ChatMessage, ReviewPayload } from '@guidiff/schema';
import App from './App.tsx';

const payload: ReviewPayload = {
  version: '1.2.3-test',
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
  ai: { enabled: false },
};

let payloadToServe: ReviewPayload;
let chatToServe: ChatMessage[] = [];
// Lets a single test make one fetchChat() call hang until released, to
// reproduce a stale re-fetch racing a newer chat turn.
let stallNextFetch = false;
let releaseStalledFetch: (() => void) | null = null;
mock.module('./api.ts', () => ({
  fetchReview: async () => payloadToServe,
  createComment: async () => ({ id: 1 }),
  updateComment: async () => ({}),
  deleteComment: async () => ({}),
  setFileViewed: async () => ({}),
  setSectionReviewed: async () => ({}),
  submitReview: async () => ({}),
  cancelReview: async () => ({}),
  fetchChat: async () => {
    if (stallNextFetch) {
      stallNextFetch = false;
      // Snapshot now: the caller reads it only once released, by which
      // time chatToServe may have moved on — that's the staleness this
      // simulates.
      const stale = chatToServe;
      await new Promise<void>((resolve) => { releaseStalledFetch = resolve; });
      return { messages: stale };
    }
    return { messages: chatToServe };
  },
  // Stateful like the real server: App re-fetches the transcript after every
  // turn, so the mock must remember what was sent.
  sendChatMessage: async function* (content: string, context?: ChatContext) {
    const id = chatToServe.length + 1;
    const user: ChatMessage = { id, role: 'user', content, status: 'done', ...(context ? { context } : {}) };
    const assistant: ChatMessage = { id: id + 1, role: 'assistant', content: 'pong', status: 'done' };
    chatToServe = [...chatToServe, user, assistant];
    yield { type: 'delta', text: 'po' };
    yield { type: 'delta', text: 'ng' };
    yield { type: 'done', message: assistant };
  },
  abortChat: async () => ({}),
  clearChat: async () => { chatToServe = []; return {}; },
}));

const guidedPayload: ReviewPayload = {
  version: '1.2.3-test',
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
  ai: { enabled: false },
};

const aiPayload: ReviewPayload = { ...payload, ai: { enabled: true } };

describe('App', () => {
  test('loads review payload and shows target and files', async () => {
    payloadToServe = payload;
    render(<App />);
    await waitFor(() => expect(screen.getByText('working tree')).toBeTruthy());
    expect(screen.getAllByText('src/a.ts').length).toBeGreaterThan(0);
    expect(screen.getByText('const a = 2;')).toBeTruthy();
  });

  test('header shows the CLI version', async () => {
    payloadToServe = payload;
    render(<App />);
    await waitFor(() => expect(screen.getByText('v1.2.3-test')).toBeTruthy());
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
    version: '1.2.3-test',
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
    ai: { enabled: false },
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

  test('cancelling shows the done screen with an auto-close countdown', async () => {
    payloadToServe = payload;
    window.close = mock(() => {});
    render(<App />);
    await waitFor(() => expect(screen.getByText('working tree')).toBeTruthy());

    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.getByText(/Review cancelled/)).toBeTruthy());
    expect(screen.getByText('Closing in 5s…')).toBeTruthy();
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

  const spyScroll = (id: string) => {
    const el = document.getElementById(id) as HTMLElement;
    const fn = mock(() => {});
    el.scrollIntoView = fn;
    return fn;
  };

  test('checking a file viewed scrolls to the next file in render order', async () => {
    payloadToServe = guidedPayload;
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#section-core')).toBeTruthy());

    const scrolled = spyScroll('file-src/extra.ts');
    fireEvent.click(fileCheckbox('src/a.ts'));
    await waitFor(() =>
      expect(scrolled).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' }),
    );
  });

  test('checking the last file viewed does not scroll', async () => {
    payloadToServe = guidedPayload;
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#section-core')).toBeTruthy());

    const scrolledA = spyScroll('file-src/a.ts');
    const scrolledExtra = spyScroll('file-src/extra.ts');
    fireEvent.click(fileCheckbox('src/extra.ts'));
    expect(scrolledA).not.toHaveBeenCalled();
    expect(scrolledExtra).not.toHaveBeenCalled();
  });

  test('unchecking a file viewed does not scroll', async () => {
    payloadToServe = syncPayload(true, ['core']);
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#section-core')).toBeTruthy());

    const scrolled = spyScroll('file-src/b.ts');
    fireEvent.click(fileCheckbox('src/a.ts'));
    expect(scrolled).not.toHaveBeenCalled();
  });

  test('checking a section scrolls to the next section\'s first file', async () => {
    payloadToServe = guidedPayload;
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#section-core')).toBeTruthy());

    const scrolled = spyScroll('file-src/extra.ts');
    fireEvent.click(sectionCheckbox(container as HTMLElement));
    await waitFor(() =>
      expect(scrolled).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' }),
    );
  });

  test('checking the last section does not scroll', async () => {
    payloadToServe = syncPayload(false, []);
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#section-core')).toBeTruthy());

    const scrolledA = spyScroll('file-src/a.ts');
    const scrolledB = spyScroll('file-src/b.ts');
    fireEvent.click(sectionCheckbox(container as HTMLElement));
    expect(scrolledA).not.toHaveBeenCalled();
    expect(scrolledB).not.toHaveBeenCalled();
  });

  test('without a guide, checking a file viewed scrolls to the next file', async () => {
    payloadToServe = {
      ...payload,
      files: [mkFile('src/a.ts'), mkFile('src/b.ts')],
    };
    render(<App />);
    await waitFor(() => expect(screen.getByText('working tree')).toBeTruthy());

    const scrolled = spyScroll('file-src/b.ts');
    fireEvent.click(fileCheckbox('src/a.ts'));
    await waitFor(() =>
      expect(scrolled).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' }),
    );
  });

  test('with a guide, every section row gets a resize handle', async () => {
    payloadToServe = guidedPayload;
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#section-core')).toBeTruthy());

    // one row per section: core + the synthesized other-changes
    expect(container.querySelectorAll('.section-row .resize-handle').length).toBe(2);
  });

  test('without a guide, the sidebar layout gets a resize handle', async () => {
    payloadToServe = payload;
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText('working tree')).toBeTruthy());

    expect(container.querySelectorAll('.layout > .resize-handle').length).toBe(1);
  });

  test('renders the guide summary as markdown', async () => {
    payloadToServe = {
      ...guidedPayload,
      guide: { ...guidedPayload.guide!, summary: 'Adds **markdown** support.' },
    };
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.guide-summary')).toBeTruthy());
    const summary = container.querySelector('.guide-summary') as HTMLElement;
    expect(summary.querySelector('strong')?.textContent).toBe('markdown');
  });

  test('cmd+enter opens the submit modal', async () => {
    payloadToServe = payload;
    render(<App />);
    await waitFor(() => expect(screen.getByText('working tree')).toBeTruthy());

    fireEvent.keyDown(document.body, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(screen.getByText('Finish your review')).toBeTruthy());
  });

  test('cmd+enter that submits a comment does not open the submit modal', async () => {
    payloadToServe = payload;
    render(<App />);
    await waitFor(() => expect(screen.getByText('working tree')).toBeTruthy());

    fireEvent.mouseDown(screen.getAllByText('1')[0]!);
    fireEvent.mouseUp(document);
    const textarea = screen.getByPlaceholderText('Leave a comment');
    fireEvent.change(textarea, { target: { value: 'looks off' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() => expect(screen.queryAllByPlaceholderText('Leave a comment').length).toBe(0));
    expect(screen.queryAllByText('Finish your review').length).toBe(0);
  });

  test('cmd+enter while the submit modal is open is left to the modal', async () => {
    payloadToServe = payload;
    render(<App />);
    await waitFor(() => expect(screen.getByText('working tree')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(screen.getByText('Finish your review')).toBeTruthy());

    fireEvent.keyDown(screen.getByLabelText('Change review action'), { key: 'Enter', metaKey: true });
    await waitFor(() =>
      expect(screen.getByText(/Review submitted/)).toBeTruthy(),
    );
  });

  test('with ai disabled there is no Ask AI button', async () => {
    payloadToServe = payload;
    render(<App />);
    await waitFor(() => expect(screen.getByText('working tree')).toBeTruthy());
    expect(screen.queryByText('Ask AI')).toBeNull();
  });

  test('the header button toggles the chat panel', async () => {
    payloadToServe = aiPayload;
    chatToServe = [];
    render(<App />);
    await waitFor(() => expect(screen.getByText('Ask AI')).toBeTruthy());
    expect(screen.queryByLabelText('Ask AI')).toBeNull();
    fireEvent.click(screen.getByText('Ask AI'));
    expect(screen.getByLabelText('Ask AI')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close Ask AI'));
    expect(screen.queryByLabelText('Ask AI')).toBeNull();
  });

  test('sending a question streams the answer into the panel', async () => {
    payloadToServe = aiPayload;
    chatToServe = [];
    render(<App />);
    await waitFor(() => expect(screen.getByText('Ask AI')).toBeTruthy());
    fireEvent.click(screen.getByText('Ask AI'));
    const input = screen.getByPlaceholderText('Ask about this diff…');
    fireEvent.change(input, { target: { value: 'why?' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(screen.getByText('pong')).toBeTruthy());
    expect(screen.getByText('why?')).toBeTruthy();
  });

  test('Ask AI from a comment form opens the panel with the question and its context', async () => {
    payloadToServe = aiPayload;
    chatToServe = [];
    render(<App />);
    await waitFor(() => expect(screen.getByText('Ask AI')).toBeTruthy());
    const newLineCell = screen.getAllByText('1').find((el) => el.closest('tr')?.classList.contains('line-add'))!;
    fireEvent.mouseDown(newLineCell, { button: 0, shiftKey: true });
    fireEvent.change(screen.getByPlaceholderText('Leave a comment'), { target: { value: 'what is a?' } });
    fireEvent.click(within(screen.getByPlaceholderText('Leave a comment').closest('.comment-form') as HTMLElement).getByText('Ask AI'));
    await waitFor(() => expect(screen.getByText('src/a.ts:1')).toBeTruthy());
    expect(screen.getByText('what is a?')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Leave a comment')).toBeNull();
  });

  test('Add as comment opens a prefilled comment form on the question range', async () => {
    payloadToServe = aiPayload;
    chatToServe = [
      { id: 1, role: 'user', content: 'why?', status: 'done', context: { file: 'src/a.ts', side: 'new', startLine: 1, endLine: 1, code: 'const a = 2;' } },
      { id: 2, role: 'assistant', content: 'Because.', status: 'done' },
    ];
    render(<App />);
    await waitFor(() => expect(screen.getByText('Ask AI')).toBeTruthy());
    fireEvent.click(screen.getByText('Ask AI'));
    await waitFor(() => expect(screen.getByText('Add as comment')).toBeTruthy());
    fireEvent.click(screen.getByText('Add as comment'));
    await waitFor(() => expect((screen.getByPlaceholderText('Leave a comment') as HTMLTextAreaElement).value).toBe('Because.'));
  });

  test('a stale chat re-fetch does not clobber a newer turn', async () => {
    payloadToServe = aiPayload;
    chatToServe = [];
    stallNextFetch = false;
    releaseStalledFetch = null;
    render(<App />);
    await waitFor(() => expect(screen.getByText('Ask AI')).toBeTruthy());
    fireEvent.click(screen.getByText('Ask AI'));

    // Arm the stall so the first turn's post-stream re-fetch hangs, holding
    // a transcript snapshot that predates the second turn.
    stallNextFetch = true;
    const input = screen.getByPlaceholderText('Ask about this diff…');
    fireEvent.change(input, { target: { value: 'first' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(screen.getByText('first')).toBeTruthy());
    await waitFor(() => expect(releaseStalledFetch).toBeTruthy());

    // The first turn's re-fetch is now stuck in flight. Send a second turn
    // entirely on top of it; its own (unstalled) re-fetch lands normally.
    fireEvent.change(input, { target: { value: 'second' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(screen.getByText('second')).toBeTruthy());

    // Release the first turn's stale re-fetch. Its snapshot lacks the
    // second turn; without a generation guard this would wipe it out.
    releaseStalledFetch!();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('second')).toBeTruthy();
  });
});
