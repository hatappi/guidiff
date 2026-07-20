import { useEffect, useState } from 'react';
import type { ReviewComment, ReviewPayload } from '@guidiff/schema';
import * as api from './api.ts';
import FileDiffView from './components/FileDiffView.tsx';
import GuidePane from './components/GuidePane.tsx';
import SubmitModal from './components/SubmitModal.tsx';

export default function App() {
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [finished, setFinished] = useState<'submit' | 'cancel' | null>(null);

  useEffect(() => {
    api.fetchReview().then(setPayload).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!payload) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const intersecting = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = e.target.id.replace(/^file-/, '');
          if (e.isIntersecting) intersecting.add(id);
          else intersecting.delete(id);
        }
        const first = payload.files.find((f) => intersecting.has(f.path));
        if (first) setActiveFile(first.path);
      },
      { rootMargin: '0px 0px -70% 0px' },
    );
    document.querySelectorAll('.file').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [payload]);

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
          {payload.guide
            ? `${payload.reviewedSections.length} / ${payload.guide.sections.length} sections reviewed`
            : `${viewedCount} / ${payload.files.length} files viewed`}
        </span>
        <button className="view-toggle" onClick={() => setViewMode(viewMode === 'unified' ? 'split' : 'unified')}>
          {viewMode === 'unified' ? 'Split view' : 'Unified view'}
        </button>
        <button className="primary" onClick={() => setModalOpen(true)}>Submit</button>
        <button onClick={() => { api.cancelReview().finally(() => setFinished('cancel')); }}>Cancel</button>
      </header>
      <div className="layout">
        {payload.guide ? (
          <GuidePane
            guide={payload.guide}
            reviewedSections={payload.reviewedSections}
            fileViewed={Object.fromEntries(payload.files.map((f) => [f.path, f.state.viewed]))}
            activeFile={activeFile}
            onToggleSection={toggleSection}
            onJump={jumpTo}
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
          {payload.files.map((f) => (
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
          onSubmit={(verdict, overall) => {
            api.submitReview(verdict, overall).then(() => setFinished('submit')).catch((e) => setError(String(e)));
          }}
        />
      )}
    </div>
  );
}
