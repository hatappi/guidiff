import type { GuideSection } from '@guidiff/schema';

const IMPORTANCE_LABEL = { core: 'Core', supporting: 'Supporting', 'low-signal': 'Low signal' } as const;

export interface GuideSectionBlockProps {
  section: GuideSection;
  position: string;
  reviewed: boolean;
  files: Array<{ path: string; line?: number }>;
  onToggleSection: (id: string, reviewed: boolean) => void;
  onJump: (file: string, line?: number) => void;
}

/**
 * Guide text for one section, rendered as the left cell of a section row.
 * Sticky positioning within the row is handled entirely by CSS
 * (.guide-block in styles.css).
 */
export default function GuideSectionBlock(props: GuideSectionBlockProps) {
  const { section } = props;
  return (
    <section className="guide-block" id={`guide-block-${section.id}`}>
      <div className="guide-block-meta">{props.position}</div>
      <div className="guide-section-header">
        <input
          type="checkbox"
          checked={props.reviewed}
          onChange={(e) => props.onToggleSection(section.id, e.target.checked)}
        />
        <h3>{section.title}</h3>
        <span className={`importance-badge ${section.importance}`}>{IMPORTANCE_LABEL[section.importance]}</span>
      </div>
      <p className="guide-section-desc">{section.description}</p>
      <ul className="anchors">
        {props.files.map((f) => (
          <li key={`${f.path}:${f.line ?? ''}`}>
            <button className="anchor-link" onClick={() => props.onJump(f.path, f.line)}>
              {f.line != null ? `${f.path}:${f.line}` : f.path}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
