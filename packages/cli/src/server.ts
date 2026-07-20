import {
  ReviewCommentSchema,
  ReviewResultSchema,
  VerdictSchema,
  type FileDiff,
  type FileState,
  type Guide,
  type ReviewPayload,
  type ReviewResult,
  type StateFile,
} from '@guidiff/schema';
import { z } from 'zod';
import { saveState, setViewed } from './state.ts';
import { ReviewStore } from './store.ts';

export type ReviewOutcome = { type: 'submit'; result: ReviewResult } | { type: 'cancel' };

export interface ServerOptions {
  port: number;
  target: string;
  guide: Guide | null;
  files: FileDiff[];
  fileStates: Map<string, FileState>;
  gitDir: string;
  state: StateFile;
  staticRoutes?: Record<string, unknown>;
}

const SubmitSchema = z.object({ verdict: VerdictSchema, overallComment: z.string().optional() });
const ViewedSchema = z.object({ path: z.string().min(1), viewed: z.boolean() });
const SectionReviewedSchema = z.object({ reviewed: z.boolean() });
const CommentPatchSchema = z.object({ body: z.string().min(1) });

export function startServer(opts: ServerOptions) {
  const store = new ReviewStore();
  let state = opts.state;
  let resolveOutcome!: (o: ReviewOutcome) => void;
  const outcome = new Promise<ReviewOutcome>((resolve) => (resolveOutcome = resolve));

  const json = (data: unknown, status = 200) => Response.json(data, { status });
  const badRequest = (e: unknown) => json({ error: String(e) }, 400);

  async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
    return schema.parse(await req.json());
  }

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: opts.port,
    routes: {
      ...(opts.staticRoutes ?? {}),
      '/api/review': {
        GET: () => {
          const payload: ReviewPayload = {
            target: opts.target,
            guide: opts.guide,
            files: opts.files.map((f) => ({
              ...f,
              state: opts.fileStates.get(f.path) ?? { viewed: false, changedSinceLastView: false },
            })),
            comments: store.comments(),
            reviewedSections: store.reviewedSections(),
          };
          return json(payload);
        },
      },
      '/api/comments': {
        POST: async (req: Request) => {
          try {
            return json(store.addComment(await parseBody(req, ReviewCommentSchema)), 201);
          } catch (e) {
            return badRequest(e);
          }
        },
      },
      '/api/comments/:id': {
        PATCH: async (req: Request & { params: { id: string } }) => {
          try {
            const { body } = await parseBody(req, CommentPatchSchema);
            const updated = store.updateComment(Number(req.params.id), body);
            return updated ? json(updated) : json({ error: 'not found' }, 404);
          } catch (e) {
            return badRequest(e);
          }
        },
        DELETE: (req: Request & { params: { id: string } }) =>
          store.deleteComment(Number(req.params.id)) ? json({ ok: true }) : json({ error: 'not found' }, 404),
      },
      '/api/sections/:id/reviewed': {
        PUT: async (req: Request & { params: { id: string } }) => {
          try {
            const { reviewed } = await parseBody(req, SectionReviewedSchema);
            store.setSectionReviewed(req.params.id, reviewed);
            return json({ ok: true });
          } catch (e) {
            return badRequest(e);
          }
        },
      },
      '/api/files/viewed': {
        PUT: async (req: Request) => {
          try {
            const { path, viewed } = await parseBody(req, ViewedSchema);
            const file = opts.files.find((f) => f.path === path);
            if (!file) return json({ error: 'unknown file' }, 404);
            state = setViewed(state, file, viewed, new Date());
            opts.fileStates.set(path, {
              viewed,
              changedSinceLastView: false,
              lastViewedAt: viewed ? new Date().toISOString() : undefined,
            });
            await saveState(opts.gitDir, state);
            return json({ ok: true });
          } catch (e) {
            return badRequest(e);
          }
        },
      },
      '/api/submit': {
        POST: async (req: Request) => {
          try {
            const { verdict, overallComment } = await parseBody(req, SubmitSchema);
            const result = ReviewResultSchema.parse({
              version: 1,
              verdict,
              ...(overallComment ? { overallComment } : {}),
              comments: store.comments().map(({ id: _id, ...c }) => c),
              reviewedSections: store.reviewedSections(),
            });
            queueMicrotask(() => resolveOutcome({ type: 'submit', result }));
            return json({ ok: true });
          } catch (e) {
            return badRequest(e);
          }
        },
      },
      '/api/cancel': {
        POST: () => {
          queueMicrotask(() => resolveOutcome({ type: 'cancel' }));
          return json({ ok: true });
        },
      },
    },
  });

  return { server, url: `http://127.0.0.1:${server.port}`, outcome };
}
