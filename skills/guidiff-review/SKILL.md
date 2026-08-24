---
name: guidiff-review
description: This skill should be used when the user asks to review code changes with a guided
  local review UI — "guidiff でレビュー", "レビュー画面を開いて", "ガイド付きでレビューしたい",
  "review with guidiff", "open the review UI", or after writing a significant amount of code
  when the user wants to review it before committing. Also handles reviewing a GitHub pull
  request — "この PR を guidiff でレビュー", "review this PR", a pasted
  https://github.com/owner/repo/pull/N URL. Generates a reading guide for the diff,
  launches the guidiff browser UI, waits for the review, and acts on the returned verdict
  and comments.
allowed-tools:
  - Bash(guidiff:*)
  - Bash(command -v guidiff)
  - Bash(command -v gh)
  - Bash(git diff:*)
  - Bash(git status:*)
  - Bash(gh pr view:*)
  - Bash(gh pr diff:*)
  - Read
  - Write
  - Agent
---

# guidiff review

Launch a guided local code review and act on its result. The `guidiff` CLI serves a
GitHub-like review UI, blocks until the reviewer submits, then prints a result JSON to
stdout (exit 0). Exit 2 means the review was cancelled; exit 1 is an error.

## Flow

### 1. Preflight: check the CLI is installed

Run `command -v guidiff` (Bash). If it is missing, stop and tell the user how to
install it — do not attempt the review without it:

    git clone https://github.com/hatappi/guidiff && cd guidiff
    bun install && bun run build:binary
    mv guidiff ~/.local/bin/   # or anywhere on PATH

Then continue once `guidiff --help` works.

### 2. Fix the review target

The target decides every later command. It is one of:

| Target | guidiff argument | How to read the diff |
| --- | --- | --- |
| Uncommitted work (default) | *(none)* | `git diff HEAD` |
| A ref range | `main..HEAD`, `main feature` | `git diff main..HEAD` |
| A GitHub pull request | the PR URL | `gh pr diff <url>` |

A PR target is any `https://github.com/<owner>/<repo>/pull/<n>` URL the user pasted or
named ("この PR をレビューして", "review PR #12"). It additionally needs the GitHub CLI:
run `command -v gh`, and if it is missing, tell the user to install it
(<https://cli.github.com>) rather than falling back to a local diff. guidiff still has
to run inside a git repository — that is where the viewed-state file lives — but the PR
does not need to be fetched locally.

### 3. Write an intent brief

Summarize in 3-5 bullet points, from your own context: what was changed and why, what
the reviewer should scrutinize, and anything intentionally left out. You know this;
do not re-read the diff for it.

For a PR you did not write, you have no such context: read it instead with
`gh pr view <url>` (title, body, and the discussion) and build the brief from the
author's own description.

### 4. Decide the guide language

Resolve the language once, before writing anything, and use it for every piece of guide
prose. First hit wins:

1. A language the user asked for in this session ("英語でガイドを書いて", "write the
   guide in English").
2. `guide_language` in the project's `.claude/guidiff.local.md`.
3. `guide_language` in `~/.claude/guidiff.local.md` — the user's default across repos.
4. Otherwise, the language the user is speaking in this session.

Read those two files with Read, project first (expand `~` to the absolute home
directory path — Read rejects a literal `~`), and stop at the first one that yields a
value. Both are optional: a missing file, missing frontmatter, or a missing
`guide_language` key just means "not configured" — move on, never report it as an error.

```markdown
---
guide_language: en   # any language name or tag: en / ja / English / 日本語
---
```

The language applies to prose only: `title`, `summary`, and each section's `title` and
`description`. Section `id`s stay kebab-case ASCII, and file paths, identifiers, and
quoted code keep their original spelling regardless of the language.

### 5. Generate the guide JSON

Check the diff size first: `git diff --stat HEAD` (or the refs being reviewed). For a
PR target use `gh pr diff <url> --name-only` and `gh pr diff <url> | wc -l` instead.

- **Under ~150 changed lines**: write the guide yourself.
- **Over ~150 changed lines**: dispatch a subagent (Agent tool, general-purpose) with:
  - the intent brief,
  - the resolved guide language,
  - the diff target (e.g. `HEAD`, `main..HEAD`, or the PR URL),
  - the guide JSON schema below,
  - the output path (a file in the scratchpad directory, e.g. `<scratchpad>/guidiff-guide-<timestamp>.json`),
  - instruction: "Read the diff yourself with `git diff` (or `gh pr diff <url>` for a
    PR target). Write the guide JSON to the given path. Reply ONLY with the section
    titles you chose, one per line."

Anchor `file` paths must match the diff's own paths — for a PR that means the paths in
`gh pr diff`, which are repository-relative just like git's.

Guide JSON schema (validated by guidiff with zod):

```jsonc
{
  "version": 1,
  "title": "Short title of the change",
  "summary": "2-3 sentence overview shown at the top of the review; markdown subset supported (see below)",
  "sections": [            // ordered: recommended reading order
    {
      "id": "kebab-case-id",
      "title": "The heart of the change",
      "description": "Purpose, impact, and why it was implemented this way; markdown subset supported (see below)",
      "importance": "core",              // "core" | "supporting" | "low-signal"
      "anchors": [                        // direct links into the diff
        { "file": "src/auth.ts" },        // whole file
        { "file": "src/app.ts", "lines": [12, 45] }  // line range (new side)
      ]
    }
  ]
}
```

Guide-writing principles:
- Put the conceptual core first, wiring and call sites second, generated/low-signal
  churn (lockfiles, snapshots) last as `low-signal`.
- Descriptions explain intent and impact, not what the code literally says.
- Write all prose in the language resolved in step 4.
- `summary` and `description` support a markdown subset: `**bold**`, `*italic*`,
  `` `inline code` ``, `-` bullet lists, and `1.` ordered lists. Single `\n`
  renders as a line break. Use it for structure — bold for key terms, inline
  code for identifiers/paths, bullet lists for enumerations — instead of long
  prose paragraphs; the guide pane is narrow.
- Anything outside that subset (headings, links, images, tables, code blocks,
  blockquotes, raw HTML) renders as literal text or degrades unpredictably
  (e.g. a code fence collapses into an inline code span) — never use it.
- Titles state what the section is about, nothing more. Never prefix them with the
  importance level (no "Core:", "Low-signal:", etc.) — the UI already renders
  `importance` as an icon next to the title.
- Anchor every section to the exact files/lines that prove it.
- Build sections by GROUPING the changed files: every changed file belongs to
  exactly ONE section. Never anchor the same file from two sections — when a
  file is relevant to several concepts, put it in the section where it matters
  most and mention the relationship in the other section's description instead.

### 6. Launch guidiff in the background

Run with the Bash tool with `run_in_background: true` (a foreground run would hit the
10-minute timeout while the user reviews):

```bash
guidiff --guide <scratchpad>/guidiff-guide-<timestamp>.json
```

Pass the target as the first argument when it is not the working tree — a range
(`guidiff main..HEAD --guide ...`) or a PR URL
(`guidiff https://github.com/owner/repo/pull/12 --guide ...`); guidiff recognises the
URL itself and pulls the diff through `gh pr diff`. Tell the user the review UI is
opening in their browser, then stop — the task notification will arrive when they
submit.

### 7. Handle the result

When the background task exits, read its output:

- **exit 0**: stdout is the result JSON.
  - `verdict: "approve"` → report it (with `overallComment` if present) and continue
    whatever the user asked for next. Do NOT commit unless the user asked.
  - `verdict: "request_changes"` → list each comment with your proposed response
    (fix / explain / discuss) and ask the user to confirm before editing code. Some
    comments are questions, not change requests. After applying agreed fixes, offer
    to re-run the review.
  - Comments without `side`/`startLine`/`endLine` are file-level: they apply to the
    whole file rather than a specific line range.
  - A comment with a `suggestion` field is a **suggested change** — concrete
    replacement code the reviewer wrote, like a GitHub suggestion:

    ```jsonc
    {
      "file": "src/auth.ts",
      "side": "new",           // suggestions are always on the new side
      "startLine": 12,
      "endLine": 14,
      "body": "Early-return instead of nesting",
      "suggestion": "  if (!user) return null;\n  return user.token;"
    }
    ```

    Apply it by replacing lines `startLine`–`endLine` of the **current** file with
    `suggestion` verbatim — it is exact text, including indentation, and it already
    accounts for the file as changed. An empty `suggestion` (`""`) means delete
    those lines. Apply suggestions with Edit, matching the existing text of that
    range; do not re-indent or reformat them.

    Suggestions are the reviewer's own code, so apply them as given rather than
    proposing your own variant. Still confirm before editing, mention any
    suggestion you believe is wrong (rather than silently skipping it), and
    apply the accompanying `body` guidance too when it asks for more than the
    replaced lines. `body` may be empty (`""`) on a comment carrying a
    suggestion — the replacement code is the entire message. Line numbers shift as you edit — apply suggestions to a file
    bottom-up, or re-read the file between edits.
  For a PR target the reviewed code is not necessarily what is checked out locally:
  report the verdict and the comments, but do not edit files or apply suggestions
  unless the PR branch is actually the current checkout. Otherwise offer to post the
  feedback on the PR or to check the branch out first, and let the user choose.
- **exit 2**: the review was cancelled. Say so and stop; do not act on the diff.
- **exit 1**: read stderr, fix the problem (e.g. regenerate an invalid guide) and retry once.

### 8. Re-review cycle

When re-running after fixes, append to the intent brief: the previous review's comments
and what you changed in response. Instruct the guide generator to put a "What changed
since the last review" section first (importance: core). Unchanged files stay marked
Viewed automatically via guidiff's persisted state. Resolve the guide language again
as in step 4 rather than copying it from the previous run's guide file.
