import { describe, expect, test } from 'bun:test';
import type { Guide } from '@guidiff/schema';
import { buildSectionGroups, OTHER_SECTION_ID, type FileWithState } from './sections.ts';

const file = (path: string): FileWithState => ({
  path, status: 'modified', binary: false, hunks: [], patch: 'x',
  state: { viewed: false, changedSinceLastView: false },
});

const guide: Guide = {
  version: 1,
  title: 'T',
  summary: 'S',
  sections: [
    { id: 'core', title: 'Core', description: 'd', importance: 'core',
      anchors: [{ file: 'a.ts', side: 'new' }, { file: 'b.ts', side: 'new' }] },
    { id: 'wiring', title: 'Wiring', description: 'd', importance: 'supporting',
      anchors: [{ file: 'b.ts', side: 'new' }, { file: 'missing.ts', side: 'new' }] },
  ],
};

describe('buildSectionGroups', () => {
  const files = [file('a.ts'), file('b.ts'), file('c.ts')];
  const groups = buildSectionGroups(guide, files);

  test('groups follow guide order', () => {
    expect(groups.map((g) => g.section.id)).toEqual(['core', 'wiring', OTHER_SECTION_ID]);
  });

  test('a file renders only in its first owning section', () => {
    expect(groups[0]!.files.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
    expect(groups[1]!.files).toEqual([]); // b.ts already owned by core; missing.ts unresolvable
  });

  test('uncovered files go to a synthesized trailing section', () => {
    const other = groups[2]!;
    expect(other.section.id).toBe(OTHER_SECTION_ID);
    expect(other.section.importance).toBe('low-signal');
    expect(other.files.map((f) => f.path)).toEqual(['c.ts']);
    expect(other.section.anchors.map((a) => a.file)).toEqual(['c.ts']);
  });

  test('no synthesized section when everything is covered', () => {
    const covered = buildSectionGroups(guide, [file('a.ts'), file('b.ts')]);
    expect(covered.map((g) => g.section.id)).toEqual(['core', 'wiring']);
  });
});

describe('buildSectionGroups id collisions', () => {
  test('synthesized id avoids a guide section already named other-changes', () => {
    const collidingGuide: Guide = {
      version: 1,
      title: 'T',
      summary: 'S',
      sections: [
        {
          id: OTHER_SECTION_ID,
          title: 'Other changes (author-defined)',
          description: 'd',
          importance: 'supporting',
          anchors: [{ file: 'a.ts', side: 'new' }],
        },
      ],
    };
    const files = [file('a.ts'), file('c.ts')];
    const groups = buildSectionGroups(collidingGuide, files);

    const ids = groups.map((g) => g.section.id);
    expect(new Set(ids).size).toBe(ids.length);

    expect(groups[0]!.section.id).toBe(OTHER_SECTION_ID);
    expect(groups[0]!.files.map((f) => f.path)).toEqual(['a.ts']);

    expect(groups[1]!.section.id).toBe(`${OTHER_SECTION_ID}-2`);
    expect(groups[1]!.files.map((f) => f.path)).toEqual(['c.ts']);
  });
});
