import { z } from 'zod';

// ---- Guide (session -> guidiff) ----

export const AnchorSchema = z.object({
  file: z.string().min(1),
  lines: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  side: z.enum(['new', 'old']).default('new'),
});
export type Anchor = z.infer<typeof AnchorSchema>;

export const GuideSectionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'id must be kebab-case'),
  title: z.string().min(1),
  description: z.string().min(1),
  importance: z.enum(['core', 'supporting', 'low-signal']),
  anchors: z.array(AnchorSchema).min(1),
});
export type GuideSection = z.infer<typeof GuideSectionSchema>;

export const GuideSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  sections: z.array(GuideSectionSchema).min(1),
});
export type Guide = z.infer<typeof GuideSchema>;

// ---- Review result (guidiff -> session, stdout) ----

export const ReviewCommentSchema = z
  .object({
    file: z.string().min(1),
    side: z.enum(['new', 'old']).optional(),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
    body: z.string().min(1),
  })
  .refine(
    (c) =>
      (c.side !== undefined) === (c.startLine !== undefined)
      && (c.startLine !== undefined) === (c.endLine !== undefined),
    { message: 'side, startLine and endLine must be provided together or all omitted' },
  )
  .refine(
    (c) => c.startLine === undefined || c.endLine === undefined || c.endLine >= c.startLine,
    { message: 'endLine must be >= startLine' },
  );
export type ReviewComment = z.infer<typeof ReviewCommentSchema>;

export const VerdictSchema = z.enum(['approve', 'request_changes']);
export type Verdict = z.infer<typeof VerdictSchema>;

export const ReviewResultSchema = z.object({
  version: z.literal(1),
  verdict: VerdictSchema,
  overallComment: z.string().optional(),
  comments: z.array(ReviewCommentSchema),
  reviewedSections: z.array(z.string()),
});
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

// ---- Persisted per-repo state (.git/guidiff/state.json) ----

export const StateFileSchema = z.object({
  version: z.literal(1),
  files: z.record(
    z.string(),
    z.object({
      viewed: z.boolean(),
      patchHash: z.string(),
      viewedAt: z.string(),
    }),
  ),
});
export type StateFile = z.infer<typeof StateFileSchema>;

// ---- Diff snapshot types (cli -> ui payload; plain interfaces) ----

export interface DiffLine {
  type: 'context' | 'add' | 'del';
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface Hunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  binary: boolean;
  hunks: Hunk[];
  patch: string;
}

export interface FileState {
  viewed: boolean;
  changedSinceLastView: boolean;
  lastViewedAt?: string;
}

export interface StoredComment extends ReviewComment {
  id: number;
}

export interface ReviewPayload {
  target: string;
  guide: Guide | null;
  files: Array<FileDiff & { state: FileState }>;
  comments: StoredComment[];
  reviewedSections: string[];
}
