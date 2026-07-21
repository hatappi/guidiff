import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReviewComment, ReviewPayload } from '@guidiff/schema';
import * as api from './api.ts';
import FileDiffView from './components/FileDiffView.tsx';
import GuideSectionBlock from './components/GuideSectionBlock.tsx';
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
  const [overviewOpen, setOverviewOpen] = useState(true);
  const headerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.fetchReview().then(setPayload).catch((e) => setError(String(e)));
  }, []);

  const groups = useMemo(
    () => (payload?.guide ? buildSectionGroups(payload.guide, payload.files) : null),
    [payload?.guide, payload?.files],
  );

  // The sticky header's height varies with the overview panel's open state
  // and summary length. Publish the measured height as --header-h so the
  // sticky offsets in CSS track it.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () =>
      document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [payload, overviewOpen]);

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

  const diffProps = (f: ReviewPayload['files'][number]) => ({
    file: f,
    comments: payload.comments.filter((c) => c.file === f.path),
    viewMode,
    onToggleViewed: toggleViewed,
    onAddComment: addComment,
    onUpdateComment: updateComment,
    onDeleteComment: deleteComment,
  });

  return (
    <div className="app">
      <div className="app-header" ref={headerRef}>
        <header className="header">
          <h1>guidiff</h1>
          <span className="target">{payload.target}</span>
          <span className="progress">
            {payload.guide && groups
              ? `${payload.reviewedSections.filter((id) => groups.some((g) => g.section.id === id)).length} / ${groups.length} sections reviewed`
              : `${viewedCount} / ${payload.files.length} files viewed`}
          </span>
          {payload.guide && (
            <button
              className="overview-toggle"
              aria-expanded={overviewOpen}
              onClick={() => setOverviewOpen((o) => !o)}
            >
              {overviewOpen ? 'Overview ▴' : 'Overview ▾'}
            </button>
          )}
          <button className="theme-toggle" aria-label="Toggle theme" onClick={toggleTheme}>
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button className="view-toggle" onClick={() => setViewMode(viewMode === 'unified' ? 'split' : 'unified')}>
            {viewMode === 'unified' ? 'Split view' : 'Unified view'}
          </button>
          <button className="primary" onClick={() => setModalOpen(true)}>Submit</button>
          <button onClick={() => { api.cancelReview().finally(() => setFinished('cancel')); }}>Cancel</button>
        </header>
        {payload.guide && overviewOpen && (
          <section className="overview-panel">
            <h2>{payload.guide.title}</h2>
            <p className="guide-summary">{payload.guide.summary}</p>
          </section>
        )}
      </div>
      {payload.guide && groups ? (
        <main className="sections">
          {groups.map((g, i) => (
            <section key={g.section.id} className="section-row" id={`section-${g.section.id}`}>
              <GuideSectionBlock
                section={g.section}
                position={`${i + 1} / ${groups.length}`}
                reviewed={payload.reviewedSections.includes(g.section.id)}
                files={g.files.map((f) => ({
                  path: f.path,
                  line: g.section.anchors.find((a) => a.file === f.path)?.lines?.[0],
                }))}
                allViewed={g.files.length > 0 && g.files.every((f) => f.state.viewed)}
                onToggleSection={toggleSection}
                onJump={jumpTo}
              />
              <div className="section-files">
                {g.files.map((f) => (
                  <FileDiffView key={f.path} {...diffProps(f)} />
                ))}
              </div>
            </section>
          ))}
        </main>
      ) : (
        <div className="layout">
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
          <main className="main">
            {payload.files.map((f) => (
              <FileDiffView key={f.path} {...diffProps(f)} />
            ))}
          </main>
        </div>
      )}
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
