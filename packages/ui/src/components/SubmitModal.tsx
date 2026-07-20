import { useState } from 'react';
import type { StoredComment, Verdict } from '@guidiff/schema';

export default function SubmitModal(props: {
  comments: StoredComment[];
  onSubmit: (verdict: Verdict, overallComment?: string) => void;
  onClose: () => void;
}) {
  const [verdict, setVerdict] = useState<Verdict>('approve');
  const [overall, setOverall] = useState('');
  const n = props.comments.length;
  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Finish your review</h2>
        <div className="verdict-options">
          <label>
            <input type="radio" name="verdict" aria-label="Approve"
              checked={verdict === 'approve'} onChange={() => setVerdict('approve')} />
            Approve
          </label>
          <label>
            <input type="radio" name="verdict" aria-label="Request changes"
              checked={verdict === 'request_changes'} onChange={() => setVerdict('request_changes')} />
            Request changes
          </label>
        </div>
        <textarea
          placeholder="Overall comment (optional)"
          value={overall}
          onChange={(e) => setOverall(e.target.value)}
          rows={3}
        />
        <div className="modal-comments">
          <h3>{n === 1 ? '1 comment' : `${n} comments`}</h3>
          <ul>
            {props.comments.map((c) => (
              <li key={c.id}>
                <span className="comment-loc">{c.file}:{c.startLine}</span> {c.body}
              </li>
            ))}
          </ul>
        </div>
        <div className="modal-actions">
          <button onClick={props.onClose}>Back</button>
          <button className="primary" onClick={() => props.onSubmit(verdict, overall.trim() || undefined)}>
            Submit review
          </button>
        </div>
      </div>
    </div>
  );
}
