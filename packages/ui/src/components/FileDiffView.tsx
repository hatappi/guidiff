import type { ReviewComment, ReviewPayload, StoredComment } from '@guidiff/schema';
import { buildSplitRows } from '../split.ts';
import { CodeCell } from './DiffLines.tsx';

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

const STATUS_LABEL: Record<FileWithState['status'], string> = {
  added: 'Added', modified: 'Modified', deleted: 'Deleted', renamed: 'Renamed',
};

export default function FileDiffView(props: FileDiffViewProps) {
  const { file } = props;
  return (
    <section className="file" id={`file-${file.path}`} data-viewed={file.state.viewed}>
      <div className="file-header">
        <span className={`status status-${file.status}`}>{STATUS_LABEL[file.status]}</span>
        <h2>{file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}</h2>
        {file.state.changedSinceLastView && (
          <span className="badge-changed" title={`Last viewed ${file.state.lastViewedAt ?? ''}`}>
            Changed since last view
          </span>
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
      {file.binary ? (
        <div className="binary-note">Binary file not shown</div>
      ) : file.state.viewed ? (
        <div className="collapsed-note">Marked as viewed — collapsed</div>
      ) : viewBody(props)}
    </section>
  );
}

function viewBody(props: FileDiffViewProps) {
  const { file, viewMode } = props;
  return file.hunks.map((hunk, i) => (
    <div key={i}>
      <div className="hunk-header">{hunk.header}</div>
      {viewMode === 'unified' ? (
        <table className="hunk"><tbody>
          {hunk.lines.map((l, j) => (
            <tr key={j} className={`line line-${l.type}`}>
              <td className="ln">{l.oldLine ?? ''}</td>
              <td className="ln">{l.newLine ?? ''}</td>
              <td className="code"><CodeCell text={l.text} filePath={file.path} /></td>
            </tr>
          ))}
        </tbody></table>
      ) : (
        <table className="hunk hunk-split"><tbody>
          {buildSplitRows(hunk).map((row, j) => (
            <tr key={j}>
              <td className={`ln ${row.left ? `line-${row.left.type}` : ''}`}>{row.left?.oldLine ?? ''}</td>
              <td className={`code ${row.left ? `line-${row.left.type}` : 'empty'}`}>
                {row.left ? <CodeCell text={row.left.text} filePath={file.path} /> : null}
              </td>
              <td className={`ln ${row.right ? `line-${row.right.type}` : ''}`}>{row.right?.newLine ?? ''}</td>
              <td className={`code ${row.right ? `line-${row.right.type}` : 'empty'}`}>
                {row.right ? <CodeCell text={row.right.text} filePath={file.path} /> : null}
              </td>
            </tr>
          ))}
        </tbody></table>
      )}
    </div>
  ));
}
