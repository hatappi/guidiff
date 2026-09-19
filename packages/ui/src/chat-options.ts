import { CHAT_EFFORTS, CHAT_MODELS, type ChatEffort, type ChatModel, type ChatOptions } from '@guidiff/schema';

const MODEL_KEY = 'guidiff.chat.model';
const EFFORT_KEY = 'guidiff.chat.effort';

const isModel = (v: string | null): v is ChatModel => (CHAT_MODELS as readonly string[]).includes(v ?? '');
const isEffort = (v: string | null): v is ChatEffort => (CHAT_EFFORTS as readonly string[]).includes(v ?? '');

// Storage may be unavailable (private window, blocked site data); the panel
// simply starts from the defaults then.
export function loadChatOptions(): ChatOptions {
  try {
    const model = localStorage.getItem(MODEL_KEY);
    const effort = localStorage.getItem(EFFORT_KEY);
    return { ...(isModel(model) ? { model } : {}), ...(isEffort(effort) ? { effort } : {}) };
  } catch {
    return {};
  }
}

export function saveChatOptions(options: ChatOptions): void {
  try {
    if (options.model) localStorage.setItem(MODEL_KEY, options.model);
    else localStorage.removeItem(MODEL_KEY);
    if (options.effort) localStorage.setItem(EFFORT_KEY, options.effort);
    else localStorage.removeItem(EFFORT_KEY);
  } catch {
    // Nothing to do: the in-memory selection still applies for this page.
  }
}
