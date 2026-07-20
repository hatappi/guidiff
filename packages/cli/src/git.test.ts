import { describe, expect, test } from 'bun:test';
import { parseUnifiedDiff, resolveDiffSpec } from './git.ts';

const SAMPLE = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,4 +1,5 @@
 import x from 'x';
-const a = 1;
+const a = 2;
+const b = 3;
 export default a;
diff --git a/newfile.txt b/newfile.txt
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/newfile.txt
@@ -0,0 +1,2 @@
+hello
+world
diff --git a/gone.txt b/gone.txt
deleted file mode 100644
index 4444444..0000000
--- a/gone.txt
+++ /dev/null
@@ -1,1 +0,0 @@
-bye
diff --git a/img.png b/img.png
index 5555555..6666666 100644
Binary files a/img.png and b/img.png differ
`;

describe('parseUnifiedDiff', () => {
  const files = parseUnifiedDiff(SAMPLE);

  test('parses all files with status', () => {
    expect(files.map((f) => [f.path, f.status, f.binary])).toEqual([
      ['src/app.ts', 'modified', false],
      ['newfile.txt', 'added', false],
      ['gone.txt', 'deleted', false],
      ['img.png', 'modified', true],
    ]);
  });

  test('parses hunk line numbers', () => {
    const hunk = files[0]!.hunks[0]!;
    expect(hunk.header).toBe('@@ -1,4 +1,5 @@');
    expect(hunk.lines).toEqual([
      { type: 'context', oldLine: 1, newLine: 1, text: "import x from 'x';" },
      { type: 'del', oldLine: 2, text: 'const a = 1;' },
      { type: 'add', newLine: 2, text: 'const a = 2;' },
      { type: 'add', newLine: 3, text: 'const b = 3;' },
      { type: 'context', oldLine: 3, newLine: 4, text: 'export default a;' },
    ]);
  });

  test('keeps the raw per-file patch for hashing', () => {
    expect(files[0]!.patch.startsWith('diff --git a/src/app.ts b/src/app.ts')).toBe(true);
    expect(files[0]!.patch).toContain('+const b = 3;');
    expect(files[0]!.patch).not.toContain('newfile.txt');
  });

  test('parses renames', () => {
    const renamed = parseUnifiedDiff(`diff --git a/old-name.ts b/new-name.ts
similarity index 90%
rename from old-name.ts
rename to new-name.ts
index 1111111..2222222 100644
--- a/old-name.ts
+++ b/new-name.ts
@@ -1,1 +1,1 @@
-const x = 1;
+const x = 2;
`);
    expect(renamed[0]!.status).toBe('renamed');
    expect(renamed[0]!.path).toBe('new-name.ts');
    expect(renamed[0]!.oldPath).toBe('old-name.ts');
  });

  test('returns empty array for empty input', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });
});

describe('resolveDiffSpec', () => {
  test('no args or "." means worktree', () => {
    expect(resolveDiffSpec([])).toEqual({ kind: 'worktree' });
    expect(resolveDiffSpec(['.'])).toEqual({ kind: 'worktree' });
  });

  test('two refs compare', () => {
    expect(resolveDiffSpec(['main', 'feature'])).toEqual({
      kind: 'range',
      args: ['main', 'feature'],
      label: 'main..feature',
    });
  });

  test('range syntax passes through', () => {
    expect(resolveDiffSpec(['main..HEAD'])).toEqual({
      kind: 'range',
      args: ['main..HEAD'],
      label: 'main..HEAD',
    });
  });

  test('single ref compares against worktree', () => {
    expect(resolveDiffSpec(['main'])).toEqual({
      kind: 'range',
      args: ['main'],
      label: 'main..(working tree)',
    });
  });
});
