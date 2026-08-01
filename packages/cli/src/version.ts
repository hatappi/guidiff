import pkg from '../../../package.json';

// Injected via `bun build --define GUIDIFF_VERSION='"..."'` by
// scripts/build-binary.ts (dev: "X.Y.Z-dev+<hash>") and scripts/release.ts
// (release: "X.Y.Z"). Absent when running from source.
declare const GUIDIFF_VERSION: string | undefined;

export const VERSION: string =
  typeof GUIDIFF_VERSION === 'string' ? GUIDIFF_VERSION : `${pkg.version}-dev`;
