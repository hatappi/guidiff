import {
  CHAT_EFFORTS,
  CHAT_MODELS,
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
import { dirname } from 'node:path';
import { z } from 'zod';
import { BusyError, buildSystemPrompt, ChatSession } from './ai/chat.ts';
import type { ChatEvent, ChatProvider } from './ai/provider.ts';
import { saveState, setViewed } from './state.ts';
import { ReviewStore } from './store.ts';
import { VERSION } from './version.ts';

export type ReviewOutcome = { type: 'submit'; result: ReviewResult } | { type: 'cancel' };

export interface ServerOptions {
  port: number;
  target: string;
  repo: string;
  guide: Guide | null;
  files: FileDiff[];
  fileStates: Map<string, FileState>;
  gitDir: string;
  state: StateFile;
  staticRoutes?: Record<string, unknown>;
  // Absent means the Ask AI panel is disabled.
  ai?: { provider: ChatProvider; cwd: string; patchPath: string | null; isPullRequest: boolean };
}

const SubmitSchema = z.object({ verdict: VerdictSchema, overallComment: z.string().optional() });
const ViewedSchema = z.object({ path: z.string().min(1), viewed: z.boolean() });
const SectionReviewedSchema = z.object({ reviewed: z.boolean() });
const CommentPatchSchema = z.object({
  // An empty body is only valid alongside a suggestion; the store's re-parse
  // against ReviewCommentSchema enforces that after the patch is applied.
  body: z.string(),
  suggestion: z.string().nullable().optional(),
});
const ChatContextSchema = z.object({
  file: z.string().min(1),
  side: z.enum(['new', 'old']).optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  code: z.string().optional(),
});
const ChatSendSchema = z.object({
  content: z.string().trim().min(1),
  context: ChatContextSchema.optional(),
  model: z.enum(CHAT_MODELS).optional(),
  effort: z.enum(CHAT_EFFORTS).optional(),
});

export function startServer(opts: ServerOptions) {
  const store = new ReviewStore();
  let state = opts.state;
  let resolveOutcome!: (o: ReviewOutcome) => void;
  const outcome = new Promise<ReviewOutcome>((resolve) => (resolveOutcome = resolve));

  const json = (data: unknown, status = 200) => Response.json(data, { status });
  const badRequest = (e: unknown) => json({ error: String(e) }, 400);

  const chat = opts.ai
    ? new ChatSession({
        provider: opts.ai.provider,
        cwd: opts.ai.cwd,
        // The patch file may live outside the checkout (linked worktrees keep
        // the git dir under the main repo), and restricted mode only reads
        // inside the working directories.
        ...(opts.ai.patchPath ? { addDirs: [dirname(opts.ai.patchPath)] } : {}),
        systemPrompt: buildSystemPrompt({
          target: opts.target,
          guide: opts.guide,
          files: opts.files,
          patchPath: opts.ai.patchPath,
          isPullRequest: opts.ai.isPullRequest,
        }),
      })
    : null;
  const aiDisabled = () => json({ error: 'Ask AI is disabled' }, 404);

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
            version: VERSION,
            target: opts.target,
            repo: opts.repo,
            guide: opts.guide,
            files: opts.files.map((f) => ({
              ...f,
              state: opts.fileStates.get(f.path) ?? { viewed: false, changedSinceLastView: false },
            })),
            comments: store.comments(),
            reviewedSections: store.reviewedSections(),
            ai: { enabled: chat !== null },
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
            const patch = await parseBody(req, CommentPatchSchema);
            const updated = store.updateComment(Number(req.params.id), patch);
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
            const now = new Date();
            state = setViewed(state, file, viewed, now);
            opts.fileStates.set(path, {
              viewed,
              changedSinceLastView: false,
              lastViewedAt: viewed ? now.toISOString() : undefined,
            });
            await saveState(opts.gitDir, state);
            return json({ ok: true });
          } catch (e) {
            return badRequest(e);
          }
        },
      },
      '/api/chat': {
        GET: () => (chat ? json({ messages: chat.messages() }) : aiDisabled()),
      },
      '/api/chat/messages': {
        POST: async (req: Request, server: Bun.Server<undefined>) => {
          if (!chat) return aiDisabled();
          let body: z.infer<typeof ChatSendSchema>;
          try {
            body = await parseBody(req, ChatSendSchema);
          } catch (e) {
            return badRequest(e);
          }
          let events: AsyncIterator<ChatEvent>;
          try {
            events = chat.send(body.content, body.context, {
              ...(body.model ? { model: body.model } : {}),
              ...(body.effort ? { effort: body.effort } : {}),
            })[Symbol.asyncIterator]();
          } catch (e) {
            if (e instanceof BusyError) return json({ error: e.message }, 409);
            throw e;
          }
          // Captured now, not read off chat.messages().at(-1) later: a
          // /api/chat/clear mid-turn empties the transcript, and the closing
          // frame still needs to name the assistant message that was aborted.
          const assistantId = chat.messages().at(-1)!.id;
          const finalMessage = () =>
            chat.messages().find((m) => m.id === assistantId) ??
            // clear() dropped the transcript mid-turn: the turn was aborted, so say so.
            { id: assistantId, role: 'assistant' as const, content: '', status: 'aborted' as const };
          const encoder = new TextEncoder();
          const frame = (event: string, data: unknown) =>
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          const stream = new ReadableStream<Uint8Array>({
            async pull(controller) {
              // Guard a thrown iterator too, so the client always gets exactly one closing `done` frame.
              try {
                // pull() is not re-invoked after a call that neither enqueues
                // nor closes, so skipping the provider's own 'done'/'error'
                // markers must not return early.
                for (;;) {
                  const { value, done } = await events.next();
                  if (done) {
                    controller.enqueue(frame('done', { message: finalMessage() }));
                    controller.close();
                    return;
                  }
                  if (value.type === 'delta') {
                    controller.enqueue(frame('delta', { text: value.text }));
                    return;
                  }
                }
              } catch {
                controller.enqueue(frame('done', { message: finalMessage() }));
                controller.close();
              }
            },
            cancel() {
              // The browser went away mid-reply: stop paying for tokens.
              chat.abort();
              void events.return?.(undefined);
            },
          });
          // The model may stay silent past Bun's 10s idle default before its
          // first token (it reads the patch and thinks); the turn is bounded
          // by abort/dispose, not by the socket, so exempt this request.
          server.timeout(req, 0);
          return new Response(stream, {
            headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
          });
        },
      },
      '/api/chat/abort': {
        POST: () => {
          if (!chat) return aiDisabled();
          chat.abort();
          return json({ ok: true });
        },
      },
      '/api/chat/clear': {
        POST: () => {
          if (!chat) return aiDisabled();
          chat.clear();
          return json({ ok: true });
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
            chat?.abort();
            queueMicrotask(() => resolveOutcome({ type: 'submit', result }));
            return json({ ok: true });
          } catch (e) {
            return badRequest(e);
          }
        },
      },
      '/api/cancel': {
        POST: () => {
          chat?.abort();
          queueMicrotask(() => resolveOutcome({ type: 'cancel' }));
          return json({ ok: true });
        },
      },
    },
  });

  return { server, url: `http://127.0.0.1:${server.port}`, outcome, dispose: () => chat?.abort() };
}
