import type { ChatContext, ChatMessage, FileDiff, Guide } from '@guidiff/schema';
import type { ChatEvent, ChatProvider } from './provider.ts';

export function buildPrompt(content: string, context?: ChatContext): string {
  if (!context) return content;
  let header = `File: ${context.file}`;
  if (context.startLine !== undefined && context.endLine !== undefined) {
    const side = context.side === 'old' ? 'old' : 'new';
    const range = context.startLine === context.endLine
      ? `line ${context.startLine}`
      : `lines ${context.startLine}-${context.endLine}`;
    header += ` (${side} side, ${range})`;
  }
  const code = context.code === undefined ? '' : `\n\`\`\`\n${context.code}\n\`\`\``;
  return `${header}${code}\n\n${content}`;
}

export interface SystemPromptInput {
  target: string;
  guide: Guide | null;
  files: FileDiff[];
  patchPath: string | null;
  isPullRequest: boolean;
}

export function buildSystemPrompt(input: SystemPromptInput): string {
  const parts = [
    'You are helping a human reviewer understand a code change in a local review tool (guidiff).',
    'Answer concisely and concretely. Never modify files; you only have read-only tools.',
    `Review target: ${input.target}`,
  ];
  if (input.guide) {
    parts.push(`Reading guide title: ${input.guide.title}`, `Reading guide summary: ${input.guide.summary}`);
  }
  parts.push('Changed files:', ...input.files.map((f) => `- ${f.path} (${f.status})`));
  if (input.patchPath) {
    parts.push(`The full unified diff under review is saved at ${input.patchPath}; read it with the Read tool when you need the exact changes.`);
  }
  parts.push('The working directory is the repository; you may inspect it with Read, Grep and Glob for surrounding context.');
  if (input.isPullRequest) {
    parts.push('The target is a pull request that may not be checked out locally, so the working directory can differ from the diff. Treat the diff as authoritative.');
  }
  return parts.join('\n');
}

export class BusyError extends Error {
  constructor() {
    super('a reply is already in progress');
  }
}

export interface ChatSessionOptions {
  provider: ChatProvider;
  cwd: string;
  addDirs?: string[];
  systemPrompt: string;
}

export class ChatSession {
  #messages: ChatMessage[] = [];
  #nextId = 1;
  #providerSessionId: string | undefined;
  #inflight: AbortController | null = null;

  constructor(private readonly opts: ChatSessionOptions) {}

  messages(): ChatMessage[] {
    return this.#messages.map((m) => ({ ...m }));
  }

  busy(): boolean {
    return this.#inflight !== null;
  }

  send(content: string, context?: ChatContext): AsyncIterable<ChatEvent> {
    if (this.#inflight) throw new BusyError();
    const user: ChatMessage = {
      id: this.#nextId++, role: 'user', content, ...(context ? { context } : {}), status: 'done',
    };
    const assistant: ChatMessage = { id: this.#nextId++, role: 'assistant', content: '', status: 'streaming' };
    this.#messages.push(user, assistant);
    const controller = new AbortController();
    this.#inflight = controller;
    return this.#run(assistant, buildPrompt(content, context), controller);
  }

  async *#run(assistant: ChatMessage, prompt: string, controller: AbortController): AsyncGenerator<ChatEvent> {
    const iterator = this.opts.provider.ask({
      prompt,
      systemPrompt: this.opts.systemPrompt,
      ...(this.#providerSessionId ? { sessionId: this.#providerSessionId } : {}),
      cwd: this.opts.cwd,
      ...(this.opts.addDirs ? { addDirs: this.opts.addDirs } : {}),
      signal: controller.signal,
    })[Symbol.asyncIterator]();

    // We race every pull against the signal ourselves instead of trusting a
    // plain `for await` to stop promptly: a provider only notices abort the
    // next time it awaits something of its own, and an 'abort' listener it
    // registers at that point can already be too late (the event does not
    // replay for listeners added after abort() already fired).
    const aborted = new Promise<{ aborted: true }>((resolve) => {
      if (controller.signal.aborted) resolve({ aborted: true });
      else controller.signal.addEventListener('abort', () => resolve({ aborted: true }), { once: true });
    });

    try {
      while (true) {
        const outcome = await Promise.race([iterator.next(), aborted]);
        if ('aborted' in outcome || outcome.done) break;
        const ev = outcome.value;
        if (ev.type === 'delta') assistant.content += ev.text;
        else if (ev.type === 'done') {
          assistant.status = 'done';
          if (ev.sessionId) this.#providerSessionId = ev.sessionId;
        } else {
          assistant.status = 'error';
          assistant.error = ev.message;
        }
        yield ev;
      }
    } finally {
      // Let the provider unwind its own resources (e.g. a spawned process)
      // once it next suspends; harmless if it already finished.
      iterator.return?.()?.catch(() => {});
      // Reached on completion, abort, consumer return, or provider throw.
      if (assistant.status === 'streaming') {
        if (controller.signal.aborted) assistant.status = 'aborted';
        else {
          assistant.status = 'error';
          assistant.error = 'the reply ended unexpectedly';
        }
      }
      if (this.#inflight === controller) this.#inflight = null;
    }
  }

  abort(): void {
    this.#inflight?.abort();
  }

  clear(): void {
    this.abort();
    this.#messages = [];
    this.#nextId = 1;
    this.#providerSessionId = undefined;
  }
}
