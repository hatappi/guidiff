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
    // May be empty only when the comment carries a suggestion (enforced below).
    body: z.string(),
    // Replacement text for startLine..endLine of the post-change file, like a
    // GitHub suggested change. Empty string means "delete those lines".
    suggestion: z.string().optional(),
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
  )
  .refine(
    // Suggestions rewrite the post-change file, so they only make sense on a
    // new-side line range — never file-level, never on deleted lines.
    (c) => c.suggestion === undefined || (c.side === 'new' && c.startLine !== undefined),
    { message: 'suggestion requires a new-side line range' },
  )
  .refine(
    // A suggestion speaks for itself; anything else needs words.
    (c) => c.body !== '' || c.suggestion !== undefined,
    { message: 'body is required unless the comment carries a suggestion' },
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

// ---- Ask AI chat (cli -> ui; never part of the review result) ----

export const CHAT_MODELS = ['sonnet', 'opus', 'fable', 'haiku'] as const;
export const CHAT_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ChatModel = (typeof CHAT_MODELS)[number];
export type ChatEffort = (typeof CHAT_EFFORTS)[number];

// Per-turn overrides for the claude subprocess; absent means the CLI default.
export interface ChatOptions {
  model?: ChatModel;
  effort?: ChatEffort;
}

export interface ChatContext {
  file: string;
  side?: 'new' | 'old';
  startLine?: number;
  endLine?: number;
  // Text of the selected lines, shown in the panel and quoted to the model.
  code?: string;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  // User messages only: what the question was asked about.
  context?: ChatContext;
  // User messages only: what the question was asked with.
  options?: ChatOptions;
  status: 'streaming' | 'done' | 'aborted' | 'error';
  // Set when status is 'error'.
  error?: string;
}

export interface ReviewPayload {
  version: string;
  target: string;
  // org/repo from the origin remote (or PR URL), else the checkout's directory name.
  repo: string;
  guide: Guide | null;
  files: Array<FileDiff & { state: FileState }>;
  comments: StoredComment[];
  reviewedSections: string[];
  ai: { enabled: boolean };
}
