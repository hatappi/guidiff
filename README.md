# guidiff

**Guided local code review.** A GitHub-like diff UI that runs on your machine,
with a reading guide that tells you where to start — and a blocking CLI that
returns your review straight to the AI session that launched it.

> guidiff = guide + diff

## Why

- Review AI-written code *before* it becomes a PR, in a UI your eyes already know.
- A reading guide orders the diff by importance: core changes first,
  lockfile churn last.
- Launched from a Claude Code session, the review result (verdict + line comments)
  lands back in that exact session — no copy-paste, no wrong-window mistakes.

## Install

```bash
bun install -g guidiff   # or: brew install hatappi/tap/guidiff (planned)
```

## Usage

```bash
guidiff                  # review uncommitted changes (working tree vs HEAD)
guidiff main feature     # review a ref range
guidiff main..HEAD       # range syntax works too
guidiff --guide g.json   # attach a reading guide
```

Exit codes: `0` submitted (result JSON on stdout) / `1` error / `2` cancelled.
stdout carries **only** the result JSON; all logs go to stderr.

## Claude Code plugin

```
/plugin marketplace add hatappi/guidiff
/plugin install guidiff@guidiff
```

Then ask Claude: *"guidiff でレビューして"* / *"review this with guidiff"*.
The session generates a guide for its own changes, opens the UI, and acts on
your verdict and comments when you submit.

## Development

```bash
bun install
bun test packages/schema packages/cli && bun test --cwd packages/ui
bun packages/cli/src/index.ts . --no-open   # run from source
bun run build:binary                         # single binary ./guidiff
```
