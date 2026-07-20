import type { Guide, GuideSection } from '@guidiff/schema';

export interface GuidePaneProps {
  guide: Guide;
  reviewedSections: string[];
  fileViewed: Record<string, boolean>;
  activeFile: string | null;
  onToggleSection: (id: string, reviewed: boolean) => void;
  onJump: (file: string, line?: number) => void;
}

const IMPORTANCE_LABEL = { core: 'Core', supporting: 'Supporting', 'low-signal': 'Low signal' } as const;

export default function GuidePane(props: GuidePaneProps) {
  const normal = props.guide.sections.filter((s) => s.importance !== 'low-signal');
  const lowSignal = props.guide.sections.filter((s) => s.importance === 'low-signal');
  return (
    <aside className="guide-pane">
      <h2>{props.guide.title}</h2>
      <p className="guide-summary">{props.guide.summary}</p>
      <ol className="guide-sections">
        {normal.map((s) => <SectionCard key={s.id} section={s} {...props} />)}
      </ol>
      {lowSignal.length > 0 && (
        <details className="low-signal-group">
          <summary>Low-signal changes ({lowSignal.length})</summary>
          <ol className="guide-sections">
            {lowSignal.map((s) => <SectionCard key={s.id} section={s} {...props} />)}
          </ol>
        </details>
      )}
    </aside>
  );
}

function SectionCard({ section, ...props }: GuidePaneProps & { section: GuideSection }) {
  const reviewed = props.reviewedSections.includes(section.id);
  const allViewed = section.anchors.every((a) => props.fileViewed[a.file]);
  const isActive = section.anchors.some((a) => a.file === props.activeFile);
  return (
    <li className={`guide-section importance-${section.importance} ${isActive ? 'active' : ''}`}>
      <div className="guide-section-header">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) => props.onToggleSection(section.id, e.target.checked)}
        />
        <h3>{section.title}</h3>
        <span className={`importance-badge ${section.importance}`}>{IMPORTANCE_LABEL[section.importance]}</span>
      </div>
      <p className="guide-section-desc">{section.description}</p>
      {allViewed && <span className="section-done">All files viewed</span>}
      <ul className="anchors">
        {section.anchors.map((a, i) => (
          <li key={i}>
            <button className="anchor-link" onClick={() => props.onJump(a.file, a.lines?.[0])}>
              {a.lines ? `${a.file}:${a.lines[0]}` : a.file}
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}
