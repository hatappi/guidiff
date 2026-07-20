import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReviewComment, ReviewPayload } from '@guidiff/schema';
import * as api from './api.ts';
import { continuousSectionIndex } from './boundary-sync.ts';
import FileDiffView from './components/FileDiffView.tsx';
import GuidePane from './components/GuidePane.tsx';
import SubmitModal from './components/SubmitModal.tsx';
import { buildSectionGroups } from './sections.ts';
import { useTheme } from './theme-context.tsx';

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
  const syncSource = useRef<'left' | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSectionRef = useRef<string | null>(null);
  const guideScrollRef = useRef<HTMLDivElement | null>(null);
  const lastLeftWriteAt = useRef(0);
  const syncingDecay = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const groups = useMemo(
    () => (payload?.guide ? buildSectionGroups(payload.guide, payload.files) : null),
    [payload?.guide, payload?.files],
  );

  // Default to the first group, and fall back to it again if the active id
  // no longer exists in a freshly derived group list (e.g. the underlying
  // files changed).
  useEffect(() => {
    if (!groups || groups.length === 0) return;
    if (activeSectionId && groups.some((g) => g.section.id === activeSectionId)) return;
    const fallback = groups[0]!.section.id;
    lastSectionRef.current = fallback;
    setActiveSectionId(fallback);
  }, [groups, activeSectionId]);

  /**
   * Left-driven only: called when a real user scroll settles the left pane
   * on a card. Activates that section and smooth-scrolls the right pane to
   * its header.
   */
  const activateSection = (id: string): boolean => {
    if (lastSectionRef.current === id) return false;
    lastSectionRef.current = id;
    syncSource.current = 'left';
    document.getElementById(`section-${id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => { syncSource.current = null; }, 600);
    setActiveSectionId(id);
    return true;
  };

  const onGuideSettle = (id: string) => {
    if (syncSource.current === 'left') return;
    activateSection(id);
  };

  // Boundary-synced scroll: as the user scrolls the right pane, compute a
  // continuous section index from where each group's bottom edge sits in
  // the viewport, then write the left pane's snap container scrollTop as a
  // proportional interpolation between the active and next card. Skipped
  // while a left-driven guided scroll is in flight (syncSource === 'left').
  useEffect(() => {
    if (!groups || groups.length === 0) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const onScroll = () => {
      if (syncSource.current === 'left') return; // guided right-scroll in flight
      const H = typeof window.innerHeight === 'number' ? window.innerHeight : 0;
      if (H <= 0) return;
      const els = groups.map((g) => document.getElementById(`section-${g.section.id}`));
      if (els.some((el) => !el)) return;
      const bottoms = els.map((el) => el!.getBoundingClientRect().bottom);
      const ci = continuousSectionIndex(bottoms, H);
      const active = Math.min(Math.floor(ci), groups.length - 1);
      const frac = ci - active;

      const container = guideScrollRef.current;
      if (container) {
        const cur = document.getElementById(`guide-card-${groups[active]!.section.id}`);
        const next = active + 1 < groups.length
          ? document.getElementById(`guide-card-${groups[active + 1]!.section.id}`)
          : null;
        if (cur) {
          lastLeftWriteAt.current = Date.now();
          container.classList.add('syncing');
          container.scrollTop = next
            ? cur.offsetTop + frac * (next.offsetTop - cur.offsetTop)
            : cur.offsetTop;
          clearTimeout(syncingDecay.current);
          syncingDecay.current = setTimeout(() => {
            guideScrollRef.current?.classList.remove('syncing');
          }, 250);
        }
      }

      const id = groups[active]!.section.id;
      if (lastSectionRef.current !== id) {
        lastSectionRef.current = id;
        setActiveSectionId(id);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(syncingDecay.current);
      guideScrollRef.current?.classList.remove('syncing');
    };
  }, [groups]);

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
    document.getElementById(`file-${file}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
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
            scrollContainerRef={guideScrollRef}
            programmaticWriteAt={lastLeftWriteAt}
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
            ? groups.map((g) => (
                <section key={g.section.id} className="section-group" id={`section-${g.section.id}`}>
                  <div className="section-group-header">
                    <h2>{g.section.title}</h2>
                    <span className={`importance-badge ${g.section.importance}`}>
                      {g.section.importance === 'core' ? 'Core' : g.section.importance === 'supporting' ? 'Supporting' : 'Low signal'}
                    </span>
                  </div>
                  {g.files.map((f) => (
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
              ))
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
