---
name: guidiff-review
description: This skill should be used when the user asks to review code changes with a guided
  local review UI — "guidiff でレビュー", "レビュー画面を開いて", "ガイド付きでレビューしたい",
  "review with guidiff", "open the review UI", or after writing a significant amount of code
  when the user wants to review it before committing. Generates a reading guide for the diff,
  launches the guidiff browser UI, waits for the review, and acts on the returned verdict
  and comments.
allowed-tools:
  - Bash(guidiff:*)
  - Bash(command -v guidiff)
  - Bash(git diff:*)
  - Bash(git status:*)
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

### 2. Write an intent brief

Summarize in 3-5 bullet points, from your own context: what was changed and why, what
the reviewer should scrutinize, and anything intentionally left out. You know this;
do not re-read the diff for it.

### 3. Generate the guide JSON

Check the diff size first: `git diff --stat HEAD` (or the refs being reviewed).

- **Under ~150 changed lines**: write the guide yourself.
- **Over ~150 changed lines**: dispatch a subagent (Agent tool, general-purpose) with:
  - the intent brief,
  - the diff target (e.g. `HEAD`, `main..HEAD`),
  - the guide JSON schema below,
  - the output path (a file in the scratchpad directory, e.g. `<scratchpad>/guidiff-guide-<timestamp>.json`),
  - instruction: "Read the diff yourself with `git diff`. Write the guide JSON to the
    given path. Reply ONLY with the section titles you chose, one per line."

Guide JSON schema (validated by guidiff with zod):

```jsonc
{
  "version": 1,
  "title": "Short title of the change",
  "summary": "2-3 sentence overview shown at the top of the review; separate sentences with \n",
  "sections": [            // ordered: recommended reading order
    {
      "id": "kebab-case-id",
      "title": "The heart of the change",
      "description": "Purpose, impact, and why it was implemented this way; separate sentences with \n",
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
- Break `summary` and `description` into short lines with `\n` — one sentence or
  idea per line. The UI preserves newlines (`white-space: pre-line`); a single
  long paragraph is hard to read in the narrow guide pane.
- Titles state what the section is about, nothing more. Never prefix them with the
  importance level (no "Core:", "Low-signal:", etc.) — the UI already renders
  `importance` as an icon next to the title.
- Anchor every section to the exact files/lines that prove it.
- Build sections by GROUPING the changed files: every changed file belongs to
  exactly ONE section. Never anchor the same file from two sections — when a
  file is relevant to several concepts, put it in the section where it matters
  most and mention the relationship in the other section's description instead.

### 4. Launch guidiff in the background

Run with the Bash tool with `run_in_background: true` (a foreground run would hit the
10-minute timeout while the user reviews):

```bash
guidiff --guide <scratchpad>/guidiff-guide-<timestamp>.json
```

(Add refs, e.g. `guidiff main..HEAD --guide ...`, when reviewing a range instead of
the working tree.) Tell the user the review UI is opening in their browser, then stop —
the task notification will arrive when they submit.

### 5. Handle the result

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
- **exit 2**: the review was cancelled. Say so and stop; do not act on the diff.
- **exit 1**: read stderr, fix the problem (e.g. regenerate an invalid guide) and retry once.

### 6. Re-review cycle

When re-running after fixes, append to the intent brief: the previous review's comments
and what you changed in response. Instruct the guide generator to put a "What changed
since the last review" section first (importance: core). Unchanged files stay marked
Viewed automatically via guidiff's persisted state.
