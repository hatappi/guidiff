import { useState } from 'react';
import type { StoredComment } from '@guidiff/schema';
import CommentForm from './CommentForm.tsx';

export default function CommentThread(props: {
  comments: StoredComment[];
  onUpdate: (id: number, body: string) => void;
  onDelete: (id: number) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  return (
    <div className="comment-thread">
      {props.comments.map((c) =>
        editingId === c.id ? (
          <CommentForm
            key={c.id}
            initialBody={c.body}
            onSubmit={(body) => { props.onUpdate(c.id, body); setEditingId(null); }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div key={c.id} className="comment">
            <div className="comment-range">
              {c.startLine === undefined
                ? 'File'
                : c.startLine === c.endLine
                  ? `Line ${c.startLine}`
                  : `Lines ${c.startLine}–${c.endLine}`}
            </div>
            <div className="comment-body">{c.body}</div>
            <div className="comment-actions">
              <button onClick={() => setEditingId(c.id)}>Edit</button>
              <button onClick={() => props.onDelete(c.id)}>Delete</button>
            </div>
          </div>
        ),
      )}
    </div>
  );
}
