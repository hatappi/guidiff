import type { Guide, GuideSection, ReviewPayload } from '@guidiff/schema';

export type FileWithState = ReviewPayload['files'][number];

export interface SectionGroup {
  section: GuideSection;
  files: FileWithState[];
}

export const OTHER_SECTION_ID = 'other-changes';

/**
 * Derives the section-ordered rendering groups. A file is rendered under the
 * first section that anchors it; files no section anchors are collected into
 * a synthesized trailing "Other changes" section.
 */
export function buildSectionGroups(guide: Guide, files: FileWithState[]): SectionGroup[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const assigned = new Set<string>();
  const groups: SectionGroup[] = [];

  for (const section of guide.sections) {
    const groupFiles: FileWithState[] = [];
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
    groups.push({
      section: {
        id: OTHER_SECTION_ID,
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
