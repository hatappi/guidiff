import type { Guide, GuideSection } from './index.ts';

export interface SectionGroup<F extends { path: string }> {
  section: GuideSection;
  files: F[];
}

export const OTHER_SECTION_ID = 'other-changes';

/**
 * Derives the section-ordered rendering groups. A file is rendered under the
 * first section that anchors it; files no section anchors are collected into
 * a synthesized trailing "Other changes" section.
 *
 * A section none of whose anchored files are in the diff is dropped: it
 * describes a change that no longer exists (typically reverted after the
 * guide was written). A section whose files are all owned by an earlier
 * section still renders, as its prose may add context.
 *
 * Shared by the UI (rendering) and the CLI (seeding reviewed sections from
 * persisted viewed state) so both agree on the synthesized section id.
 */
export function buildSectionGroups<F extends { path: string }>(guide: Guide, files: F[]): SectionGroup<F>[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const assigned = new Set<string>();
  const groups: SectionGroup<F>[] = [];

  for (const section of guide.sections) {
    if (!section.anchors.some((a) => byPath.has(a.file))) continue;
    const groupFiles: F[] = [];
    for (const anchor of section.anchors) {
      const f = byPath.get(anchor.file);
      if (!f || assigned.has(f.path)) continue;
      assigned.add(f.path);
      groupFiles.push(f);
    }
    groups.push({ section, files: groupFiles });
  }

  const uncovered = files.filter((f) => !assigned.has(f.path));
  if (uncovered.length > 0) {
    const existingIds = new Set(guide.sections.map((s) => s.id));
    let otherId = OTHER_SECTION_ID;
    for (let n = 2; existingIds.has(otherId); n++) otherId = `${OTHER_SECTION_ID}-${n}`;
    groups.push({
      section: {
        id: otherId,
        title: 'Other changes',
        description: 'Changed files not covered by the guide.',
        importance: 'low-signal',
        anchors: uncovered.map((f) => ({ file: f.path, side: 'new' as const })),
      },
      files: uncovered,
    });
  }
  return groups;
}
