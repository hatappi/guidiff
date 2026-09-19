import type { ChatContext, ChatMessage, ChatOptions, ReviewComment, ReviewPayload, StoredComment, Verdict } from '@guidiff/schema';
import { parseSse } from './sse.ts';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const fetchReview = () => request<ReviewPayload>('/api/review');
export const createComment = (c: ReviewComment) => request<StoredComment>('/api/comments', jsonInit('POST', c));
// suggestion: null removes an existing suggestion, undefined leaves it alone.
export const updateComment = (id: number, body: string, suggestion?: string | null) =>
  request<StoredComment>(`/api/comments/${id}`, jsonInit('PATCH', { body, suggestion }));
export const deleteComment = (id: number) => request(`/api/comments/${id}`, { method: 'DELETE' });
export const setFileViewed = (path: string, viewed: boolean) =>
  request('/api/files/viewed', jsonInit('PUT', { path, viewed }));
export const setSectionReviewed = (id: string, reviewed: boolean) =>
  request(`/api/sections/${id}/reviewed`, jsonInit('PUT', { reviewed }));
export const submitReview = (verdict: Verdict, overallComment?: string) =>
  request('/api/submit', jsonInit('POST', { verdict, overallComment }));
export const cancelReview = () => request('/api/cancel', { method: 'POST' });

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; message: ChatMessage };

export const fetchChat = () => request<{ messages: ChatMessage[] }>('/api/chat');
export const abortChat = () => request('/api/chat/abort', { method: 'POST' });
export const clearChat = () => request('/api/chat/clear', { method: 'POST' });

export async function* sendChatMessage(content: string, context?: ChatContext, options?: ChatOptions): AsyncGenerator<ChatStreamEvent> {
  const res = await fetch('/api/chat/messages', jsonInit('POST', { content, context, ...options }));
  if (!res.ok || !res.body) throw new Error(`/api/chat/messages failed: ${res.status}`);
  for await (const frame of parseSse(res.body)) {
    if (frame.event === 'delta') yield { type: 'delta', text: (JSON.parse(frame.data) as { text: string }).text };
    else if (frame.event === 'done') yield { type: 'done', message: (JSON.parse(frame.data) as { message: ChatMessage }).message };
  }
}
