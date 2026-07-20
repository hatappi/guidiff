import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

// GlobalRegistrator.register() must run before @testing-library/react is
// loaded (it touches the DOM globals at import time), so this is a dynamic
// import performed after registration rather than a hoisted static import.
const { cleanup } = await import('@testing-library/react');
const { afterEach, mock } = await import('bun:test');

// Real syntax highlighting (shiki) is slow to warm up and resolves
// asynchronously outside of React's render cycle. Once its module-level
// highlighter cache is warm (e.g. after earlier tests render many code
// lines), highlightLine can resolve fast enough to race with synchronous
// test assertions on the plain-text fallback, making unrelated tests
// flaky depending on run order. Tests never assert on highlighted output,
// so stub it out for determinism.
//
// This is process-global (bun:test's mock.module() resolves specifiers to
// the module's absolute file path and is not reset between test files), so
// packages/ui/src/highlight.test.ts -- which needs the REAL implementation
// -- imports it via a query-suffixed specifier ('./highlight.ts?real')
// instead of the bare one, which bypasses this stub entirely.
mock.module('./src/highlight.ts', () => ({
  highlightLine: async () => null,
  langFor: () => null,
}));

// Real React cleanup: unmounts roots rendered via @testing-library/react's
// render() and runs their effect cleanups, instead of just wiping the DOM.
afterEach(cleanup);
