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
  // Never reset, even by clear(): a stream started before a clear resolves
  // this message by id, and a reused id could let it close over the wrong
  // (new turn's) message.
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
    try {
      const events = this.opts.provider.ask({
        prompt,
        systemPrompt: this.opts.systemPrompt,
        ...(this.#providerSessionId ? { sessionId: this.#providerSessionId } : {}),
        cwd: this.opts.cwd,
        ...(this.opts.addDirs ? { addDirs: this.opts.addDirs } : {}),
        signal: controller.signal,
      });
      for await (const ev of events) {
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
    // Release the slot now rather than when the old turn's finally runs, so
    // "stop, then ask again" never trips BusyError. The stale generator's
    // finally guards on identity and leaves the new controller alone.
    const inflight = this.#inflight;
    this.#inflight = null;
    inflight?.abort();
  }

  clear(): void {
    this.abort();
    this.#messages = [];
    this.#providerSessionId = undefined;
  }
}
