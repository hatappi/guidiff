import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReviewComment, ReviewPayload } from '@guidiff/schema';
import * as api from './api.ts';
import FileDiffView from './components/FileDiffView.tsx';
import GuidePane from './components/GuidePane.tsx';
import SubmitModal from './components/SubmitModal.tsx';
import { buildSectionGroups } from './sections.ts';
import { topmostGroupId } from './scroll-sync.ts';
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
  const syncSource = useRef<'left' | 'right' | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSectionRef = useRef<string | null>(null);

  const groups = useMemo(
    () => (payload?.guide ? buildSectionGroups(payload.guide, payload.files) : null),
    [payload?.guide, payload?.files],
  );

  /** source = the pane the user interacted with; scrolls the OTHER pane. */
  const activateSection = (id: string, source: 'left' | 'right') => {
    if (lastSectionRef.current === id) return;
    lastSectionRef.current = id;
    syncSource.current = source;
    const targetId = source === 'right' ? `guide-card-${id}` : `section-${id}`;
    document.getElementById(targetId)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => { syncSource.current = null; }, 600);
    setActiveSectionId(id);
  };

  // Right-pane group observer: topmost visible group drives the left pane.
  useEffect(() => {
    if (!groups) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const order = groups.map((g) => g.section.id);
    const intersecting = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        if (syncSource.current === 'left') return;
        for (const e of entries) {
          const id = e.target.id.replace(/^section-/, '');
          if (e.isIntersecting) intersecting.add(id);
          else intersecting.delete(id);
        }
        const top = topmostGroupId(intersecting, order);
        if (top) activateSection(top, 'right');
      },
      { rootMargin: '0px 0px -60% 0px' },
    );
    document.querySelectorAll('.section-group').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [groups]);

  const onGuideSettle = (id: string) => {
    if (syncSource.current === 'right') return;
    activateSection(id, 'left');
  };

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
