import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterEach, mock } from 'bun:test';

GlobalRegistrator.register();

// Real syntax highlighting (shiki) is slow to warm up and resolves
// asynchronously outside of React's render cycle. Once its module-level
// highlighter cache is warm (e.g. after earlier tests render many code
// lines), highlightLine can resolve fast enough to race with synchronous
// test assertions on the plain-text fallback, making unrelated tests
// flaky depending on run order. Tests never assert on highlighted output,
// so stub it out for determinism.
mock.module('./src/highlight.ts', () => ({
  highlightLine: async () => null,
  langFor: () => null,
}));

afterEach(() => {
  document.body.innerHTML = '';
});
