import { describe, expect, test } from 'bun:test';
import { GuideSchema, ReviewResultSchema, StateFileSchema } from './index.ts';
import type { ReviewResult, StateFile } from './index.ts';

describe('GuideSchema', () => {
  const validGuide = {
    version: 1,
    title: 'Add auth middleware',
    summary: 'Adds JWT-based auth.',
    sections: [
      {
        id: 'core-auth',
        title: 'Core: auth middleware',
        description: 'Why and how.',
        importance: 'core',
        anchors: [
          { file: 'src/auth.ts' },
          { file: 'src/app.ts', lines: [12, 45] },
        ],
      },
    ],
  };

  test('accepts a valid guide and defaults anchor side to new', () => {
    const parsed = GuideSchema.parse(validGuide);
    expect(parsed.sections[0]!.anchors[0]!.side).toBe('new');
  });

  test('rejects unknown importance', () => {
    const bad = structuredClone(validGuide);
    bad.sections[0]!.importance = 'critical';
    expect(() => GuideSchema.parse(bad)).toThrow();
  });

  test('rejects empty sections', () => {
    expect(() => GuideSchema.parse({ ...validGuide, sections: [] })).toThrow();
  });

  test('rejects section id with uppercase', () => {
    const bad = structuredClone(validGuide);
    bad.sections[0]!.id = 'Core-Auth';
    expect(() => GuideSchema.parse(bad)).toThrow();
  });
});

describe('ReviewResultSchema', () => {
  test('round-trips a valid result', () => {
    const result: ReviewResult = {
      version: 1,
      verdict: 'request_changes',
      overallComment: 'Looks mostly good.',
      comments: [
        { file: 'src/app.ts', side: 'new', startLine: 12, endLine: 14, body: 'Early return?' },
      ],
      reviewedSections: ['core-auth'],
    };
    expect(ReviewResultSchema.parse(result)).toEqual(result);
  });

  test('rejects endLine < startLine', () => {
    const bad = {
      version: 1,
      verdict: 'approve',
      comments: [{ file: 'a', side: 'new', startLine: 5, endLine: 4, body: 'x' }],
      reviewedSections: [],
    };
    expect(() => ReviewResultSchema.parse(bad)).toThrow();
  });
});

describe('StateFileSchema', () => {
  test('accepts persisted viewed state', () => {
    const state: StateFile = {
      version: 1,
      files: {
        'src/a.ts': { viewed: true, patchHash: 'sha256:abc', viewedAt: '2026-07-20T10:00:00+09:00' },
      },
    };
    expect(StateFileSchema.parse(state)).toEqual(state);
  });
});
