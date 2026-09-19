import type { ChatEffort, ChatModel } from '@guidiff/schema';

export type ChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; sessionId: string }
  | { type: 'error'; message: string };

export interface ChatRequest {
  prompt: string;
  systemPrompt: string;
  // Provider session to continue; absent on the first turn.
  sessionId?: string;
  // Repository root: the model may inspect files relative to it.
  cwd: string;
  // Extra directories the model may read (restricted mode confines file
  // tools to cwd otherwise).
  addDirs?: string[];
  // Per-turn overrides; absent means the CLI default.
  model?: ChatModel;
  effort?: ChatEffort;
  // Aborting kills the underlying process and ends the event stream.
  signal: AbortSignal;
}

export interface ChatProvider {
  ask(req: ChatRequest): AsyncIterable<ChatEvent>;
}
