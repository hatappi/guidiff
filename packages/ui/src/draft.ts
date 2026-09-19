// A comment the reviewer asked to start from a chat answer. Consumed once by
// the FileDiffView that owns `file`.
export interface CommentDraft {
  file: string;
  side: 'new' | 'old';
  startLine: number;
  endLine: number;
  body: string;
}
