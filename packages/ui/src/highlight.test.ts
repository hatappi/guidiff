import { describe, expect, test } from 'bun:test';

// test-setup.ts's preload registers a process-global mock.module() stub for
// highlight.ts (shiki) so other test files get deterministic, fast output.
// bun:test's mock.module() keys off the module's resolved absolute file
// path, so any relative specifier that resolves to the same file --
// including a plain './highlight.ts' import right here -- would also hit
// that stub. A query-suffixed specifier resolves to a distinct module
// registry entry, bypassing the stub entirely, so this always loads the
// real, un-stubbed implementation regardless of stub registration order.
// @ts-expect-error -- the query suffix is a runtime-only Bun module-registry
// bypass; TypeScript can't resolve it as a module specifier, so assert the
// real module's shape instead.
const { highlightLine, langFor } = (await import('./highlight.ts?real')) as typeof import('./highlight.ts');

describe('langFor', () => {
  test('maps known extensions', () => {
    expect(langFor('src/app.ts')).toBe('typescript');
    expect(langFor('lib/util.go')).toBe('go');
  });
  test('returns null for unknown extensions', () => {
    expect(langFor('README.unknownext')).toBeNull();
  });
});

describe('highlightLine (real shiki)', () => {
  test('returns highlighted html for a known language', async () => {
    const html = await highlightLine('const a = 1;', 'src/app.ts');
    expect(html).toContain('<span');
    expect(html).toContain('const');
  });
  test('dark theme also returns highlighted html', async () => {
    const html = await highlightLine('const a = 1;', 'src/app.ts', 'dark');
    expect(html).toContain('<span');
  });
  test('returns null for empty text and unknown language', async () => {
    expect(await highlightLine('', 'src/app.ts')).toBeNull();
    expect(await highlightLine('x', 'file.unknownext')).toBeNull();
  });
});
