import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

export default function CommentForm(props: {
  initialBody?: string;
  initialSuggestion?: string;
  /** Current text of the commented lines; absent when the range is not suggestable. */
  suggestionBase?: string[] | null;
  onSubmit: (body: string, suggestion?: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(props.initialBody ?? '');
  // null = no suggestion block on this comment.
  const [suggestion, setSuggestion] = useState<string | null>(props.initialSuggestion ?? null);
  // A suggestion can stand on its own; a plain comment needs a body.
  const submittable = () => body.trim() !== '' || suggestion !== null;
  const submit = () => {
    if (!submittable()) return;
    const trimmed = body.trim();
    // Keep the single-argument call when there is no suggestion.
    if (suggestion === null) props.onSubmit(trimmed);
    else props.onSubmit(trimmed, suggestion);
  };
  // The form only ever appears because the reviewer is about to write, so
  // take the caret with it. Editing resumes after the existing body rather
  // than in front of it, which is where a plain autoFocus would land.
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const submitOnModEnter = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };
  return (
    <div className="comment-form">
      <textarea
        ref={bodyRef}
        placeholder="Leave a comment"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={submitOnModEnter}
        rows={3}
      />
      {suggestion !== null && (
        <div className="suggestion-editor">
          <div className="suggestion-editor-header">
            <span>Suggested change</span>
            <button className="suggestion-remove" onClick={() => setSuggestion(null)}>Remove</button>
          </div>
          <textarea
            aria-label="Suggested change"
            className="suggestion-input"
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            onKeyDown={submitOnModEnter}
            rows={Math.min(Math.max(suggestion.split('\n').length, 2), 12)}
            spellCheck={false}
          />
        </div>
      )}
      <div className="comment-form-actions">
        {suggestion === null && props.suggestionBase && (
          <button
            className="suggest-btn"
            title="Replace the selected lines with your own code"
            onClick={() => setSuggestion(props.suggestionBase!.join('\n'))}
          >
            ± Suggest a change
          </button>
        )}
        <span className="comment-form-spacer" />
        <button onClick={props.onCancel}>Cancel</button>
        <button className="primary" disabled={!submittable()} onClick={submit}>
          {props.initialBody ? 'Save' : 'Add comment'}
        </button>
      </div>
    </div>
  );
}
