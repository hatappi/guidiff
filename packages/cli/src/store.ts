import { ReviewCommentSchema, type ReviewComment, type StoredComment } from '@guidiff/schema';

export interface CommentPatch {
  body: string;
  // undefined keeps the existing suggestion, null removes it.
  suggestion?: string | null;
}

export class ReviewStore {
  #comments = new Map<number, StoredComment>();
  #reviewed = new Set<string>();
  #nextId = 1;

  addComment(input: ReviewComment): StoredComment {
    const stored: StoredComment = { ...input, id: this.#nextId++ };
    this.#comments.set(stored.id, stored);
    return stored;
  }

  // Throws a ZodError when the patch would produce an invalid comment (e.g. a
  // suggestion on a file-level comment); the server turns that into a 400.
  updateComment(id: number, patch: CommentPatch): StoredComment | null {
    const existing = this.#comments.get(id);
    if (!existing) return null;
    const { id: _id, ...rest } = existing;
    const next = { ...rest, body: patch.body };
    if (patch.suggestion === null) delete next.suggestion;
    else if (patch.suggestion !== undefined) next.suggestion = patch.suggestion;
    const updated: StoredComment = { ...ReviewCommentSchema.parse(next), id };
    this.#comments.set(id, updated);
    return updated;
  }

  deleteComment(id: number): boolean {
    return this.#comments.delete(id);
  }

  comments(): StoredComment[] {
    return [...this.#comments.values()];
  }

  // Section ids are intentionally NOT validated against the guide: the UI
  // synthesizes sections (e.g. "other-changes") whose ids must round-trip
  // into the review result unchanged.
  setSectionReviewed(id: string, reviewed: boolean): void {
    if (reviewed) this.#reviewed.add(id);
    else this.#reviewed.delete(id);
  }

  reviewedSections(): string[] {
    return [...this.#reviewed];
  }
}
