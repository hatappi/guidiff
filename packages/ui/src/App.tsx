import { useEffect, useState } from 'react';
import type { ReviewComment, ReviewPayload } from '@guidiff/schema';
import * as api from './api.ts';
import FileDiffView from './components/FileDiffView.tsx';

export default function App() {
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  useEffect(() => {
    api.fetchReview().then(setPayload).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="error">Failed to load review: {error}</div>;
  if (!payload) return <div className="loading">Loading…</div>;

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
        <span className="progress">{viewedCount} / {payload.files.length} files viewed</span>
        <button className="view-toggle" onClick={() => setViewMode(viewMode === 'unified' ? 'split' : 'unified')}>
          {viewMode === 'unified' ? 'Split view' : 'Unified view'}
        </button>
      </header>
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
  );
}
