import { useState } from 'react';
import type { StoredComment } from '@guidiff/schema';
import CommentForm from './CommentForm.tsx';
import { suggestionLines } from '../suggestion.ts';

function SuggestionBlock(props: { original: string[]; suggestion: string }) {
  const replacement = suggestionLines(props.suggestion);
  return (
    <div className="suggestion">
      <div className="suggestion-header">Suggested change</div>
      <table className="suggestion-diff"><tbody>
        {props.original.map((text, i) => (
          <tr key={`o${i}`} className="line-del"><td className="code">{text}</td></tr>
        ))}
        {replacement.map((text, i) => (
          <tr key={`n${i}`} className="line-add"><td className="code">{text}</td></tr>
        ))}
        {replacement.length === 0 && (
          <tr><td className="code suggestion-empty">(lines deleted)</td></tr>
        )}
      </tbody></table>
    </div>
  );
}

export default function CommentThread(props: {
  comments: StoredComment[];
  /** Current text of a comment's lines, for rendering and editing suggestions. */
  resolveOriginal?: (c: StoredComment) => string[] | null;
  onUpdate: (id: number, body: string, suggestion?: string | null) => void;
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
            initialSuggestion={c.suggestion}
            suggestionBase={props.resolveOriginal?.(c) ?? null}
            onSubmit={(body, suggestion) => {
              props.onUpdate(c.id, body, suggestion ?? null);
              setEditingId(null);
            }}
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
            {c.suggestion !== undefined && (
              <SuggestionBlock original={props.resolveOriginal?.(c) ?? []} suggestion={c.suggestion} />
            )}
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
