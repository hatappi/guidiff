# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

guidiff = guide + diff: a local, GitHub-like code review UI with an AI-generated reading guide. A blocking CLI serves the UI, waits for the reviewer to submit, and prints the review result JSON to stdout so the AI session that launched it can act on the verdict.

## Commands

```bash
bun install                                  # install all workspace deps
bun run test                                 # all tests (see note below)
bun test packages/cli/src/git.test.ts        # single test file (cli/schema)
bun test --cwd packages/ui src/App.test.tsx  # single UI test file
bun run typecheck                            # tsc --noEmit across all packages
bun run build:binary                         # compile single binary ./guidiff
bun packages/cli/src/index.ts . --no-open    # run CLI from source
```

UI tests MUST run with `--cwd packages/ui` (the root `test` script does this): `packages/ui/bunfig.toml` preloads `test-setup.ts`, which registers happy-dom before `@testing-library/react` loads and stubs shiki highlighting for determinism. Running `bun test packages/ui` from the repo root skips that preload and the tests break. `packages/ui/src/highlight.test.ts` needs the real implementation, so it imports `./highlight.ts?real` to bypass the process-global module mock.

## Architecture

Bun workspace monorepo, three packages with one direction of dependency: `cli` → `ui` → `schema`.

- **`packages/schema`** — zod schemas plus shared TypeScript types. This is the contract between the three actors: `GuideSchema` (AI session → CLI via `--guide`), `ReviewResultSchema` (CLI → session via stdout), `StateFileSchema` (persisted per-repo state), and the `ReviewPayload`/`FileDiff` interfaces (CLI → UI over HTTP). Changing any wire format starts here.

- **`packages/cli`** — the `guidiff` binary. `index.ts` orchestrates: parse args (`cli-args.ts`) → collect and parse the diff with git (`git.ts`, hand-rolled unified-diff parser) → load viewed-state (`state.ts`) → `startServer` (`server.ts`). The server is `Bun.serve` with the UI's `index.html` imported directly as a static route (Bun fullstack bundling — the same import works compiled into the binary). `startServer` returns an `outcome` promise that resolves when the reviewer submits or cancels via `/api/*`; `index.ts` blocks on it (optionally raced against `--timeout`). In-memory review state (comments, reviewed sections) lives in `store.ts`; viewed-file state persists to `.git/guidiff/state.json` keyed by a sha256 patch hash, so a file whose diff changed since last view resets to unviewed (`reconcileFiles`).

- **`packages/ui`** — React 19 SPA served by the CLI, talking to `/api/*` (`api.ts`). `sections.ts` derives the guide-ordered rendering: each file renders under the first guide section that anchors it, with unanchored files collected into a synthesized "Other changes" section. Syntax highlighting via shiki (`highlight.ts`), light/dark theme in `theme.ts`/`theme-context.tsx`.

- **`skills/guidiff-review`** — the Claude Code plugin skill shipped from this repo (installed via `/plugin marketplace add hatappi/guidiff`). It documents the guide JSON format and CLI contract for AI sessions; update it when CLI flags, exit codes, or schemas change.

## Conventions

- **stdout is sacred in the CLI**: the only stdout write is the final result JSON on submit. Everything else (logs, usage, errors) goes to stderr. Exit codes: 0 submitted, 1 error, 2 cancelled/timeout — the skill and calling sessions depend on this.
- Imports use explicit `.ts`/`.tsx` extensions (`allowImportingTsExtensions` + `verbatimModuleSyntax`); Bun runs the TypeScript directly, nothing is transpiled ahead of time.
- Corrupt or schema-incompatible persisted state is silently discarded, never fatal.
