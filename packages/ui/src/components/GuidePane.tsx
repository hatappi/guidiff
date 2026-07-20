import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
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
  /** Ref to the snap container, written directly by App's boundary-synced scroll handler. */
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  /** Timestamp (ms) of the last programmatic scrollTop write; settle ignores scroll/scrollend within 200ms of it. */
  programmaticWriteAt: RefObject<number>;
}

const IMPORTANCE_LABEL = { core: 'Core', supporting: 'Supporting', 'low-signal': 'Low signal' } as const;

export default function GuidePane(props: GuidePaneProps) {
  const containerRef = props.scrollContainerRef;
  const settleRef = useRef(props.onSettle);
  settleRef.current = props.onSettle;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      // Ignore settles caused by App's own programmatic scrollTop writes
      // (boundary-synced scroll), not a real user scroll.
      if (Date.now() - props.programmaticWriteAt.current < 200) return;
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
  }, [props.groups, props.programmaticWriteAt, containerRef]);

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
            files={g.files.map((f) => ({
              path: f.path,
              line: g.section.anchors.find((a) => a.file === f.path)?.lines?.[0],
            }))}
            allViewed={g.files.length > 0 && g.files.every((f) => props.fileViewed[f.path])}
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
  files: Array<{ path: string; line?: number }>;
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
