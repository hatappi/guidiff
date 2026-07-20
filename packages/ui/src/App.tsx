import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReviewComment, ReviewPayload } from '@guidiff/schema';
import * as api from './api.ts';
import FileDiffView from './components/FileDiffView.tsx';
import GuidePane from './components/GuidePane.tsx';
import SubmitModal from './components/SubmitModal.tsx';
import { createOverscrollTracker } from './overscroll.ts';
import { buildSectionGroups } from './sections.ts';
import { useTheme } from './theme-context.tsx';

const OVERSCROLL_THRESHOLD = 120;

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [modalOpen, setModalOpen] = useState(false);
  const [finished, setFinished] = useState<'submit' | 'cancel' | null>(null);

  useEffect(() => {
    api.fetchReview().then(setPayload).catch((e) => setError(String(e)));
  }, []);

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const syncSource = useRef<'left' | 'right' | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSectionRef = useRef<string | null>(null);
  const overscrollTracker = useRef(createOverscrollTracker(OVERSCROLL_THRESHOLD));

  const groups = useMemo(
    () => (payload?.guide ? buildSectionGroups(payload.guide, payload.files) : null),
    [payload?.guide, payload?.files],
  );

  // The right pane renders exactly one group at a time. Default to the first
  // group, and fall back to it again if the active id no longer exists in a
  // freshly derived group list (e.g. the underlying files changed).
  useEffect(() => {
    if (!groups || groups.length === 0) return;
    if (activeSectionId && groups.some((g) => g.section.id === activeSectionId)) return;
    const fallback = groups[0]!.section.id;
    lastSectionRef.current = fallback;
    setActiveSectionId(fallback);
  }, [groups, activeSectionId]);

  /**
   * source = the pane the user interacted with. Returns whether the section
   * actually changed (a no-op re-activation of the current section is
   * ignored so callers don't apply scroll side effects redundantly).
   */
  const activateSection = (id: string, source: 'left' | 'right'): boolean => {
    if (lastSectionRef.current === id) return false;
    lastSectionRef.current = id;
    syncSource.current = source;
    if (source === 'right') {
      // Right-driven (edge-scroll paging): sync the left pane's snap card.
      document.getElementById(`guide-card-${id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => { syncSource.current = null; }, 600);
    setActiveSectionId(id);
    return true;
  };

  const onGuideSettle = (id: string) => {
    if (syncSource.current === 'right') return;
    if (activateSection(id, 'left')) {
      window.scrollTo({ top: 0 });
    }
  };

  // Edge-scroll paging: overscrolling past the bottom/top of the right pane
  // pages to the next/previous section. Wheel events originating inside the
  // left pane's own scroll container are ignored.
  useEffect(() => {
    if (!groups || groups.length === 0) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    overscrollTracker.current.reset();

    const onWheel = (e: WheelEvent) => {
      if (e.target instanceof Element && e.target.closest('.guide-snap-container')) return;

      const scrollY = typeof window.scrollY === 'number' ? window.scrollY : 0;
      const innerHeight = typeof window.innerHeight === 'number' ? window.innerHeight : 0;
      const scrollHeight =
        typeof document.body?.scrollHeight === 'number' ? document.body.scrollHeight : 0;

      let edge: 'top' | 'bottom' | null = null;
      if (scrollY + innerHeight >= scrollHeight - 2) edge = 'bottom';
      else if (scrollY <= 2) edge = 'top';

      const result = overscrollTracker.current.feed(edge, e.deltaY, Date.now());
      if (!result) return;

      const order = groups.map((g) => g.section.id);
      const index = activeSectionId ? order.indexOf(activeSectionId) : -1;
      if (index === -1) return;
      const targetIndex = result === 'next' ? index + 1 : index - 1;
      if (targetIndex < 0 || targetIndex >= order.length) return;
      const targetId = order[targetIndex]!;

      if (activateSection(targetId, 'right')) {
        if (result === 'next') {
          window.scrollTo({ top: 0 });
        } else {
          requestAnimationFrame(() => {
            window.scrollTo({ top: document.body.scrollHeight });
          });
        }
      }
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, [groups, activeSectionId]);

  if (finished === 'submit') {
    return (
      <div className="done">
        ✅ Review submitted — the result has been returned to your session. You can close this tab.
      </div>
    );
  }
  if (finished === 'cancel') {
    return <div className="done">Review cancelled. You can close this tab.</div>;
  }
  if (error) return <div className="error">Failed to load review: {error}</div>;
  if (!payload) return <div className="loading">Loading…</div>;

  const jumpTo = (file: string, _line?: number) => {
    const scrollToFile = () => {
      document.getElementById(`file-${file}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    };
    // The anchored file may live in a section that isn't the active one;
    // activate its group first (source 'left', since the click originates
    // from the left pane) and wait a frame for the right pane to re-render
    // before scrolling to the file within it.
    const targetGroup = groups?.find((g) => g.files.some((f) => f.path === file));
    if (targetGroup && targetGroup.section.id !== activeSectionId && activateSection(targetGroup.section.id, 'left')) {
      requestAnimationFrame(scrollToFile);
    } else {
      scrollToFile();
    }
  };

  const toggleSection = (id: string, reviewed: boolean) => {
    api.setSectionReviewed(id, reviewed).catch(() => {});
    setPayload((p) => p && {
      ...p,
      reviewedSections: reviewed
        ? (p.reviewedSections.includes(id) ? p.reviewedSections : [...p.reviewedSections, id])
        : p.reviewedSections.filter((s) => s !== id),
    });
  };

  const toggleViewed = (path: string, viewed: boolean) => {
    api.setFileViewed(path, viewed).catch(() => {});
    setPayload((p) => p && {
      ...p,
      files: p.files.map((f) =>
        f.path === path ? { ...f, state: { ...f.state, viewed, changedSinceLastView: false } } : f,
      ),
    });
  };

  const addComment = (c: ReviewComment) => {
    api.createComment(c).then((stored) =>
      setPayload((p) => p && { ...p, comments: [...p.comments, stored] }),
    );
  };
  const updateComment = (id: number, body: string) => {
    api.updateComment(id, body).then(() =>
      setPayload((p) => p && { ...p, comments: p.comments.map((c) => (c.id === id ? { ...c, body } : c)) }),
    );
  };
  const deleteComment = (id: number) => {
    api.deleteComment(id).then(() =>
      setPayload((p) => p && { ...p, comments: p.comments.filter((c) => c.id !== id) }),
    );
  };

  const viewedCount = payload.files.filter((f) => f.state.viewed).length;
  const activeGroup = groups ? (groups.find((g) => g.section.id === activeSectionId) ?? groups[0] ?? null) : null;

  return (
    <div className="app">
      <header className="header">
        <h1>guidiff</h1>
        <span className="target">{payload.target}</span>
        <span className="progress">
          {payload.guide && groups
            ? `${payload.reviewedSections.filter((id) => groups.some((g) => g.section.id === id)).length} / ${groups.length} sections reviewed`
            : `${viewedCount} / ${payload.files.length} files viewed`}
        </span>
        <button className="theme-toggle" aria-label="Toggle theme" onClick={toggleTheme}>
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <button className="view-toggle" onClick={() => setViewMode(viewMode === 'unified' ? 'split' : 'unified')}>
          {viewMode === 'unified' ? 'Split view' : 'Unified view'}
        </button>
        <button className="primary" onClick={() => setModalOpen(true)}>Submit</button>
        <button onClick={() => { api.cancelReview().finally(() => setFinished('cancel')); }}>Cancel</button>
      </header>
      <div className="layout">
        {payload.guide && groups ? (
          <GuidePane
            title={payload.guide.title}
            summary={payload.guide.summary}
            groups={groups}
            reviewedSections={payload.reviewedSections}
            fileViewed={Object.fromEntries(payload.files.map((f) => [f.path, f.state.viewed]))}
            onToggleSection={toggleSection}
            onJump={jumpTo}
            onSettle={onGuideSettle}
          />
        ) : (
          <aside className="guide-pane">
            <h2>Files</h2>
            <ul className="file-list">
              {payload.files.map((f) => (
                <li key={f.path}>
                  <button className="anchor-link" onClick={() => jumpTo(f.path)}>{f.path}</button>
                </li>
              ))}
            </ul>
          </aside>
        )}
        <main className="main">
          {groups
            ? activeGroup && (
                <section key={activeGroup.section.id} className="section-group" id={`section-${activeGroup.section.id}`}>
                  <div className="section-group-header">
                    <h2>{activeGroup.section.title}</h2>
                    <span className={`importance-badge ${activeGroup.section.importance}`}>
                      {activeGroup.section.importance === 'core' ? 'Core' : activeGroup.section.importance === 'supporting' ? 'Supporting' : 'Low signal'}
                    </span>
                  </div>
                  {activeGroup.files.map((f) => (
                    <FileDiffView
                      key={f.path}
                      file={f}
                      comments={payload.comments.filter((c) => c.file === f.path)}
                      viewMode={viewMode}
                      onToggleViewed={toggleViewed}
                      onAddComment={addComment}
                      onUpdateComment={updateComment}
                      onDeleteComment={deleteComment}
                    />
                  ))}
                </section>
              )
            : payload.files.map((f) => (
                <FileDiffView
                  key={f.path}
                  file={f}
                  comments={payload.comments.filter((c) => c.file === f.path)}
                  viewMode={viewMode}
                  onToggleViewed={toggleViewed}
                  onAddComment={addComment}
                  onUpdateComment={updateComment}
                  onDeleteComment={deleteComment}
                />
              ))}
        </main>
      </div>
      {modalOpen && payload && (
        <SubmitModal
          comments={payload.comments}
          onClose={() => setModalOpen(false)}
          onSubmit={(verdict, overall) => api.submitReview(verdict, overall).then(() => setFinished('submit'))}
        />
      )}
    </div>
  );
}
