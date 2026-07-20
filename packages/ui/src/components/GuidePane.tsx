import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { GuideSection } from '@guidiff/schema';
import type { SectionGroup } from '../sections.ts';

export interface GuidePaneProps {
  title: string;
  summary: string;
  groups: SectionGroup[];
  reviewedSections: string[];
  fileViewed: Record<string, boolean>;
  onToggleSection: (id: string, reviewed: boolean) => void;
  onJump: (file: string, line?: number) => void;
  /** Ref to the card track, written directly by App's transform-based scroll sync. */
  trackRef: RefObject<HTMLDivElement | null>;
  /** Fired (throttled) when a wheel gesture at a card's edge should move to the adjacent section. */
  onStep: (direction: 'next' | 'prev') => void;
}

const IMPORTANCE_LABEL = { core: 'Core', supporting: 'Supporting', 'low-signal': 'Low signal' } as const;

/** Minimum time between onStep calls, so one wheel gesture doesn't fire multiple steps. */
const STEP_COOLDOWN_MS = 400;

export default function GuidePane(props: GuidePaneProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stepRef = useRef(props.onStep);
  stepRef.current = props.onStep;
  const lastStepAt = useRef(0);

  // Manual (non-passive) wheel listener: React's onWheel prop can't reliably
  // preventDefault a wheel gesture, and we need to stop the page from
  // scrolling when a step should happen instead.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      const direction: 'next' | 'prev' = e.deltaY > 0 ? 'next' : 'prev';
      const card = (e.target as HTMLElement | null)?.closest?.('.guide-card') as HTMLElement | null;
      if (card) {
        const canScrollFurther = direction === 'next'
          ? card.scrollTop + card.clientHeight < card.scrollHeight - 1
          : card.scrollTop > 0;
        // The card still has room to scroll in this direction: let the
        // native inner scroll handle it instead of stepping sections.
        if (canScrollFurther) return;
      }
      e.preventDefault();
      const now = Date.now();
      if (now - lastStepAt.current < STEP_COOLDOWN_MS) return;
      lastStepAt.current = now;
      stepRef.current(direction);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <aside className="guide-pane guide-pane--sections">
      <div className="guide-pane-header">
        <h2>{props.title}</h2>
        <p className="guide-summary">{props.summary}</p>
      </div>
      <div className="guide-viewport" ref={viewportRef}>
        <div className="guide-track" ref={props.trackRef}>
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
