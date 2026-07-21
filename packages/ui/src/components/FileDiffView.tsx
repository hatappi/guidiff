import { Fragment, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { DiffLine, ReviewComment, ReviewPayload, StoredComment } from '@guidiff/schema';
import { buildSplitRows } from '../split.ts';
import { CodeCell } from './DiffLines.tsx';
import CommentForm from './CommentForm.tsx';
import CommentThread from './CommentThread.tsx';

type FileWithState = ReviewPayload['files'][number];

export interface FileDiffViewProps {
  file: FileWithState;
  comments: StoredComment[];
  viewMode: 'unified' | 'split';
  onToggleViewed: (path: string, viewed: boolean) => void;
  onAddComment: (c: ReviewComment) => void;
  onUpdateComment: (id: number, body: string) => void;
  onDeleteComment: (id: number) => void;
}

type LineKey = { side: 'new' | 'old'; line: number };
type Selection = { side: 'new' | 'old'; start: number; end: number } | null;

const STATUS_LABEL: Record<FileWithState['status'], string> = {
  added: 'Added', modified: 'Modified', deleted: 'Deleted', renamed: 'Renamed',
};

function lineKey(l: DiffLine): LineKey | null {
  if (l.newLine !== undefined) return { side: 'new', line: l.newLine };
  if (l.oldLine !== undefined) return { side: 'old', line: l.oldLine };
  return null;
}

export default function FileDiffView(props: FileDiffViewProps) {
  const { file } = props;
  const [selection, setSelection] = useState<Selection>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileFormOpen, setFileFormOpen] = useState(false);
  const dragAnchor = useRef<LineKey | null>(null);
  const fileComments = props.comments.filter((c) => c.startLine === undefined);

  const submitFileComment = (body: string) => {
    props.onAddComment({ file: file.path, body });
    setFileFormOpen(false);
  };

  useEffect(() => {
    if (!dragging) return;
    const onUp = () => {
      dragAnchor.current = null;
      setDragging(false);
      setFormOpen(true);
    };
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, [dragging]);

  const beginSelect = (key: LineKey | null, shiftKey: boolean) => {
    if (!key) return;
    if (shiftKey) {
      setSelection((prev) => {
        if (prev && prev.side === key.side) {
          return { side: prev.side, start: Math.min(prev.start, key.line), end: Math.max(prev.end, key.line) };
        }
        return { side: key.side, start: key.line, end: key.line };
      });
      setFormOpen(true);
      return;
    }
    dragAnchor.current = key;
    setDragging(true);
    setFormOpen(false);
    setSelection({ side: key.side, start: key.line, end: key.line });
  };

  const extendSelect = (key: LineKey | null) => {
    const anchor = dragAnchor.current;
    if (!anchor || !key || key.side !== anchor.side) return;
    setSelection({
      side: anchor.side,
      start: Math.min(anchor.line, key.line),
      end: Math.max(anchor.line, key.line),
    });
  };

  const lnProps = (key: LineKey | null) => ({
    onMouseDown: (e: MouseEvent<HTMLTableCellElement>) => {
      e.preventDefault();
      beginSelect(key, e.shiftKey);
    },
    onMouseEnter: dragging ? () => extendSelect(key) : undefined,
  });

  const submitComment = (body: string) => {
    if (!selection) return;
    props.onAddComment({
      file: file.path,
      side: selection.side,
      startLine: selection.start,
      endLine: selection.end,
      body,
    });
    setFormOpen(false);
    setSelection(null);
  };

  const cancelComment = () => {
    setFormOpen(false);
    setSelection(null);
  };

  return (
    <section className="file" id={`file-${file.path}`} data-viewed={file.state.viewed}
      data-dragging={dragging || undefined}>
      <div className="file-header">
        <span className={`status status-${file.status}`}>{STATUS_LABEL[file.status]}</span>
        <h2>{file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}</h2>
        {file.state.changedSinceLastView && (
          <span className="badge-changed" title={`Last viewed ${file.state.lastViewedAt ?? ''}`}>
            Changed since last view
          </span>
        )}
        {!file.state.viewed && (
          <button className="comment-file-btn" onClick={() => setFileFormOpen(true)}>
            Comment on file
          </button>
        )}
        <label className="viewed-toggle">
          <input
            type="checkbox"
            aria-label="Viewed"
            checked={file.state.viewed}
            onChange={(e) => props.onToggleViewed(file.path, e.target.checked)}
          />
          Viewed
        </label>
      </div>
      {!file.state.viewed && (fileComments.length > 0 || fileFormOpen) && (
        <div className="file-comments">
          {fileComments.length > 0 && (
            <CommentThread
              comments={fileComments}
              onUpdate={props.onUpdateComment}
              onDelete={props.onDeleteComment}
            />
          )}
          {fileFormOpen && (
            <CommentForm onSubmit={submitFileComment} onCancel={() => setFileFormOpen(false)} />
          )}
        </div>
      )}
      {file.binary ? (
        <div className="binary-note">Binary file not shown</div>
      ) : file.state.viewed ? (
        <div className="collapsed-note">Marked as viewed — collapsed</div>
      ) : (
        file.hunks.map((hunk, i) => (
          <div key={i}>
            <div className="hunk-header">{hunk.header}</div>
            {props.viewMode === 'unified' ? (
              <table className="hunk"><tbody>
                {hunk.lines.map((l, j) => {
                  const key = lineKey(l);
                  const isSelected = !!(
                    selection && key && key.side === selection.side
                    && key.line >= selection.start && key.line <= selection.end
                  );
                  const lineComments = props.comments.filter(
                    (c) => key && c.side === key.side && c.endLine === key.line,
                  );
                  const showForm = !!(
                    formOpen && selection && key
                    && key.side === selection.side && key.line === selection.end
                  );
                  return (
                    <Fragment key={j}>
                      <tr className={`line line-${l.type}${isSelected ? ' selected' : ''}`}>
                        <td className="ln" {...lnProps(key)}>{l.oldLine ?? ''}</td>
                        <td className="ln" {...lnProps(key)}>{l.newLine ?? ''}</td>
                        <td className="code"><CodeCell text={l.text} filePath={file.path} /></td>
                      </tr>
                      {lineComments.length > 0 && (
                        <tr className="inline-row"><td colSpan={3}>
                          <CommentThread
                            comments={lineComments}
                            onUpdate={props.onUpdateComment}
                            onDelete={props.onDeleteComment}
                          />
                        </td></tr>
                      )}
                      {showForm && (
                        <tr className="inline-row"><td colSpan={3}>
                          <CommentForm onSubmit={submitComment} onCancel={cancelComment} />
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody></table>
            ) : (
              <table className="hunk hunk-split"><tbody>
                {buildSplitRows(hunk).map((row, j) => {
                  const leftKey: LineKey | null = row.left ? lineKey(row.left) : null;
                  const rightKey: LineKey | null = row.right ? lineKey(row.right) : null;
                  const inSelection = (key: LineKey | null) => !!(
                    selection && key && key.side === selection.side
                    && key.line >= selection.start && key.line <= selection.end
                  );
                  const leftSelected = inSelection(leftKey);
                  const rightSelected = inSelection(rightKey);
                  const rowComments = props.comments.filter(
                    (c) => (leftKey && c.side === leftKey.side && c.endLine === leftKey.line)
                      || (rightKey && c.side === rightKey.side && c.endLine === rightKey.line),
                  );
                  const showForm = !!(
                    formOpen && selection && (
                      (leftKey && selection.side === leftKey.side && selection.end === leftKey.line)
                      || (rightKey && selection.side === rightKey.side && selection.end === rightKey.line)
                    )
                  );
                  return (
                    <Fragment key={j}>
                      <tr>
                        <td
                          className={`ln ${row.left ? `line-${row.left.type}` : ''}${leftSelected ? ' selected' : ''}`}
                          {...lnProps(leftKey)}
                        >
                          {row.left?.oldLine ?? ''}
                        </td>
                        <td className={`code ${row.left ? `line-${row.left.type}` : 'empty'}${leftSelected ? ' selected' : ''}`}>
                          {row.left ? <CodeCell text={row.left.text} filePath={file.path} /> : null}
                        </td>
                        <td
                          className={`ln ${row.right ? `line-${row.right.type}` : ''}${rightSelected ? ' selected' : ''}`}
                          {...lnProps(rightKey)}
                        >
                          {row.right?.newLine ?? ''}
                        </td>
                        <td className={`code ${row.right ? `line-${row.right.type}` : 'empty'}${rightSelected ? ' selected' : ''}`}>
                          {row.right ? <CodeCell text={row.right.text} filePath={file.path} /> : null}
                        </td>
                      </tr>
                      {rowComments.length > 0 && (
                        <tr className="inline-row"><td colSpan={4}>
                          <CommentThread
                            comments={rowComments}
                            onUpdate={props.onUpdateComment}
                            onDelete={props.onDeleteComment}
                          />
                        </td></tr>
                      )}
                      {showForm && (
                        <tr className="inline-row"><td colSpan={4}>
                          <CommentForm onSubmit={submitComment} onCancel={cancelComment} />
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody></table>
            )}
          </div>
        ))
      )}
    </section>
  );
}
