import type { ReviewComment, StoredComment } from '@guidiff/schema';

export class ReviewStore {
  #comments = new Map<number, StoredComment>();
  #reviewed = new Set<string>();
  #nextId = 1;

  addComment(input: ReviewComment): StoredComment {
    const stored: StoredComment = { ...input, id: this.#nextId++ };
    this.#comments.set(stored.id, stored);
    return stored;
  }

  updateComment(id: number, body: string): StoredComment | null {
    const existing = this.#comments.get(id);
    if (!existing) return null;
    const updated = { ...existing, body };
    this.#comments.set(id, updated);
    return updated;
  }

  deleteComment(id: number): boolean {
    return this.#comments.delete(id);
  }

  comments(): StoredComment[] {
    return [...this.#comments.values()];
  }

  setSectionReviewed(id: string, reviewed: boolean): void {
    if (reviewed) this.#reviewed.add(id);
    else this.#reviewed.delete(id);
  }

  reviewedSections(): string[] {
    return [...this.#reviewed];
  }
}
