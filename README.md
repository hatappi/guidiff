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
- Don't just describe the fix — **suggest the code**. Select lines, hit
  *± Suggest a change*, and edit them right in the comment; the session applies
  your replacement verbatim.

## Install

```bash
npm install -g guidiff   # or: npx guidiff / bunx guidiff
```

Prebuilt binaries for macOS (arm64/x64) and Linux (x64/arm64). No Bun required.

Or build from source:

```bash
git clone https://github.com/hatappi/guidiff && cd guidiff
bun install && bun run build:binary
mv guidiff ~/.local/bin/   # or anywhere on your PATH
```

A Homebrew package is planned.

## Usage

```bash
guidiff                  # review uncommitted changes (working tree vs HEAD)
guidiff main feature     # review a ref range
guidiff main..HEAD       # range syntax works too
guidiff --guide g.json   # attach a reading guide

guidiff https://github.com/owner/repo/pull/12   # review a GitHub pull request
```

Reviewing a pull request shells out to [`gh`](https://cli.github.com)
(`gh pr diff <url>`), so the GitHub CLI must be installed and authenticated. The
PR does not need to be fetched locally, but guidiff still has to run inside a git
repository — that is where the per-file "viewed" state is kept.

Exit codes: `0` submitted (result JSON on stdout) / `1` error / `2` cancelled.
stdout carries **only** the result JSON; all logs go to stderr.

## Claude Code plugin

```
/plugin marketplace add hatappi/guidiff
/plugin install guidiff@guidiff
```

Then ask Claude: *"guidiff でレビューして"* / *"review this with guidiff"*.
The session generates a guide for its own changes, opens the UI, and acts on
your verdict and comments when you submit — applying any suggested changes
as written.

### Guide language

By default the guide is written in the language you are talking to Claude in.
To pin a different default, set `guide_language` in `~/.claude/guidiff.local.md`
(applies to every repo) or `.claude/guidiff.local.md` (this repo only):

```markdown
---
guide_language: en
---
```

The project file wins over the user file, and asking for a language in the
conversation wins over both. Add `.claude/*.local.md` to `.gitignore` — these
files are personal, not shared.

## Development

```bash
bun install
bun test packages/schema packages/cli && bun test --cwd packages/ui
bun packages/cli/src/index.ts . --no-open   # run from source
bun run build:binary                         # single binary ./guidiff
```

## Release (maintainers)

1. Bump `version` in the root `package.json` and commit.
2. `npm login` (once) — publishing needs the npmjs.com `guidiff` org.
3. `bun run release --dry-run` to inspect the packages, then `bun run release`.
