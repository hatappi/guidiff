import type { ReviewComment, ReviewPayload, StoredComment, Verdict } from '@guidiff/schema';

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
export const updateComment = (id: number, body: string) =>
  request<StoredComment>(`/api/comments/${id}`, jsonInit('PATCH', { body }));
export const deleteComment = (id: number) => request(`/api/comments/${id}`, { method: 'DELETE' });
export const setFileViewed = (path: string, viewed: boolean) =>
  request('/api/files/viewed', jsonInit('PUT', { path, viewed }));
export const setSectionReviewed = (id: string, reviewed: boolean) =>
  request(`/api/sections/${id}/reviewed`, jsonInit('PUT', { reviewed }));
export const submitReview = (verdict: Verdict, overallComment?: string) =>
  request('/api/submit', jsonInit('POST', { verdict, overallComment }));
export const cancelReview = () => request('/api/cancel', { method: 'POST' });
