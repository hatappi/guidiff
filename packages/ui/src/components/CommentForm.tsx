import { useState } from 'react';

export default function CommentForm(props: {
  initialBody?: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(props.initialBody ?? '');
  const submit = () => {
    const trimmed = body.trim();
    if (trimmed === '') return;
    props.onSubmit(trimmed);
  };
  return (
    <div className="comment-form">
      <textarea
        placeholder="Leave a comment"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        rows={3}
      />
      <div className="comment-form-actions">
        <button onClick={props.onCancel}>Cancel</button>
        <button className="primary" disabled={body.trim() === ''} onClick={submit}>
          {props.initialBody ? 'Save' : 'Add comment'}
        </button>
      </div>
    </div>
  );
}
