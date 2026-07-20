import type { DiffLine, Hunk } from '@guidiff/schema';

export type SplitRow = { left?: DiffLine; right?: DiffLine };

export function buildSplitRows(hunk: Hunk): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  const lines = hunk.lines;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.type === 'context') {
      rows.push({ left: line, right: line });
      i++;
      continue;
    }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i]!.type === 'del') dels.push(lines[i++]!);
    while (i < lines.length && lines[i]!.type === 'add') adds.push(lines[i++]!);
    for (let j = 0; j < Math.max(dels.length, adds.length); j++) {
      rows.push({ left: dels[j], right: adds[j] });
    }
  }
  return rows;
}
