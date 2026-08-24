import { useEffect, useRef, useState } from 'react';
import type { StoredComment, Verdict } from '@guidiff/schema';

const VERDICTS: Verdict[] = ['approve', 'request_changes'];
const VERDICT_LABEL: Record<Verdict, string> = {
  approve: 'Approve',
  request_changes: 'Request changes',
};

export default function SubmitModal(props: {
  comments: StoredComment[];
  onSubmit: (verdict: Verdict, overallComment?: string) => void | Promise<void>;
  onClose: () => void;
}) {
  // Leaving comments means asking for something, so that is the action to
  // land on; the dropdown still reaches the other one.
  const [verdict, setVerdict] = useState<Verdict>(
    props.comments.length > 0 ? 'request_changes' : 'approve',
  );
  const [overall, setOverall] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const n = props.comments.length;
  const danger = verdict === 'request_changes';
  const submit = () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    Promise.resolve(props.onSubmit(verdict, overall.trim() || undefined)).catch((e) => {
      setSubmitError(String(e));
      setSubmitting(false);
    });
  };

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!splitRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      >
        <h2>Finish your review</h2>
        <textarea
          placeholder="Overall comment (optional)"
          value={overall}
          onChange={(e) => setOverall(e.target.value)}
          rows={3}
          autoFocus
        />
        <div className="modal-comments">
          <h3>{n === 1 ? '1 comment' : `${n} comments`}</h3>
          <ul>
            {props.comments.map((c) => (
              <li key={c.id}>
                <span className="comment-loc">
                  {c.startLine === undefined ? c.file : `${c.file}:${c.startLine}`}
                </span>{' '}
                {c.suggestion !== undefined && <span className="suggestion-tag">± suggestion</span>}{' '}
                {c.body}
              </li>
            ))}
          </ul>
        </div>
        {submitError && (
          <div className="submit-error">Submit failed: {submitError}. The review stays open — try again.</div>
        )}
        <div className="modal-actions">
          <button onClick={props.onClose} disabled={submitting}>Back</button>
          <div className="verdict-split" ref={splitRef}>
            <button className={danger ? 'primary danger' : 'primary'} disabled={submitting} onClick={submit}>
              {submitting ? 'Submitting…' : VERDICT_LABEL[verdict]}
            </button>
            <button
              className={danger ? 'verdict-caret danger' : 'verdict-caret'}
              aria-label="Change review action"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={submitting}
              onClick={() => setMenuOpen((o) => !o)}
            >
              ▾
            </button>
            {menuOpen && (
              <ul className="verdict-menu" role="menu">
                {VERDICTS.map((v) => (
                  <li key={v} role="none">
                    <button
                      role="menuitem"
                      className={v === verdict ? 'selected' : undefined}
                      onClick={() => {
                        setVerdict(v);
                        setMenuOpen(false);
                      }}
                    >
                      {VERDICT_LABEL[v]}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
