import { useEffect, useRef } from 'react';
import type { GuideSection } from '@guidiff/schema';
import { nearestCardId } from '../scroll-sync.ts';
import type { SectionGroup } from '../sections.ts';

export interface GuidePaneProps {
  title: string;
  summary: string;
  groups: SectionGroup[];
  reviewedSections: string[];
  fileViewed: Record<string, boolean>;
  onToggleSection: (id: string, reviewed: boolean) => void;
  onJump: (file: string, line?: number) => void;
  /** Fired when a user scroll settles on a card (snap position reached). */
  onSettle: (sectionId: string) => void;
}

const IMPORTANCE_LABEL = { core: 'Core', supporting: 'Supporting', 'low-signal': 'Low signal' } as const;

export default function GuidePane(props: GuidePaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const settleRef = useRef(props.onSettle);
  settleRef.current = props.onSettle;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      const cards = Array.from(el.querySelectorAll<HTMLElement>('.guide-card')).map((c) => ({
        id: c.id.replace(/^guide-card-/, ''),
        offsetTop: c.offsetTop,
      }));
      const id = nearestCardId(el.scrollTop, cards);
      if (id) settleRef.current(id);
    };
    // 'scrollend' where supported; a quiet-period timer as fallback.
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(settle, 150);
    };
    el.addEventListener('scrollend', settle);
    el.addEventListener('scroll', onScroll);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('scrollend', settle);
      el.removeEventListener('scroll', onScroll);
    };
  }, [props.groups]);

  return (
    <aside className="guide-pane guide-pane--sections">
      <div className="guide-pane-header">
        <h2>{props.title}</h2>
        <p className="guide-summary">{props.summary}</p>
      </div>
      <div className="guide-snap-container" ref={containerRef}>
        {props.groups.map((g, i) => (
          <SectionCardView
            key={g.section.id}
            section={g.section}
            position={`${i + 1} / ${props.groups.length}`}
            reviewed={props.reviewedSections.includes(g.section.id)}
            allViewed={g.section.anchors.length > 0 && g.section.anchors.every((a) => props.fileViewed[a.file])}
            onToggleSection={props.onToggleSection}
            onJump={props.onJump}
          />
        ))}
      </div>
    </aside>
  );
}

function SectionCardView(props: {
  section: GuideSection;
  position: string;
  reviewed: boolean;
  allViewed: boolean;
  onToggleSection: (id: string, reviewed: boolean) => void;
  onJump: (file: string, line?: number) => void;
}) {
  const { section } = props;
  return (
    <section className="guide-card" id={`guide-card-${section.id}`}>
      <div className="guide-card-meta">{props.position}</div>
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
      {props.allViewed && <span className="section-done">All files viewed</span>}
      <ul className="anchors">
        {section.anchors.map((a) => (
          <li key={`${a.file}:${a.lines?.[0] ?? ''}`}>
            <button className="anchor-link" onClick={() => props.onJump(a.file, a.lines?.[0])}>
              {a.lines ? `${a.file}:${a.lines[0]}` : a.file}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
