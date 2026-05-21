# Security Review Guide

Two-pass security review for cyberfeed using Claude Code CLI or the claude.ai web console.

The review uses two instruction files:

- **CLAUDE.md** — coding and security gate standards (lint → tests → gosec), applied to every commit
- **Security.MD** — the two-pass review framework (Pass 1 architecture scan + Pass 2 five-agent anti-pattern scan)

Both files live as gists:
- `https://gist.github.com/cyberkryption/52b91a793890da75370d57718acc86c1` (CLAUDE.md)
- `https://gist.github.com/cyberkryption/4ffdca3ec14b28a253c590112bc26b8f` (Security.MD)

---

## One-time setup

### 1. Place CLAUDE.md in the repo root

```bash
curl -o CLAUDE.md "https://gist.githubusercontent.com/cyberkryption/52b91a793890da75370d57718acc86c1/raw"
git add CLAUDE.md
git commit -m "chore: add CLAUDE.md coding and security gates"
git push
```

Claude Code reads this file automatically at session start. The three verification gates (lint, tests, gosec) are now enforced on every commit.

### 2. Save Security.MD as a slash command

```bash
mkdir -p .claude/commands
curl -o .claude/commands/security-review.md \
  "https://gist.githubusercontent.com/cyberkryption/4ffdca3ec14b28a253c590112bc26b8f/raw"
git add .claude/commands/security-review.md
git commit -m "chore: add security review slash command"
git push
```

---

## Running the review — Claude Code CLI (recommended)

From the repo root, open a session and run the slash command:

```bash
cd ~/cyberfeed
claude
```

Then inside the session:

```
/security-review
```

That single command:
1. Runs **Pass 1** — maps the codebase, entry points, architecture, and priority files
2. Fans out **Agents A–E in parallel** across their assigned attack surfaces
3. Consolidates all findings into a severity-ordered table (HIGH / MEDIUM / LOW, with CWE refs)

No separate terminals needed — the CLI handles all parallelism internally.

### What each agent covers

| Agent | Surface |
|-------|---------|
| A | Outbound HTTP / SSRF, timeouts, redirects, TLS |
| B | Content parsing, HTML sanitisation, XSS vectors |
| C | HTTP handlers, security headers, rate limiting, CORS |
| D | Goroutine and mutex patterns, race conditions, context leaks |
| E | React frontend, unsafe rendering, localStorage, npm risks |

---

## Requesting a PR per finding

Always use **separate branches with individual PRs** rather than pushing fixes directly to main. This means:

- Each fix is independently reviewable — you can see exactly what changed and why
- You can merge the easy/safe fixes immediately without waiting for harder ones
- If a fix introduces a regression you can revert just that PR without touching others
- If you disagree with a fix you can close that PR without affecting the others
- CI runs independently on each — a failing test in one does not block the rest
- The git log stays clean — every security commit is traceable to a specific CWE

After the findings table is produced, run this follow-up in the same session:

```
For each HIGH and MEDIUM finding in the consolidated table, create a
separate branch and PR — one at a time. After opening each PR, pause
and wait for me to review and merge it before starting the next fix.
Use branch naming security/fix-<cwe>-<short-description>, run all
three CLAUDE.md gates before committing, use the security commit type,
and include the finding details (file, line, CWE, severity, suggested fix)
in the PR body. Start with the highest severity finding.
```

Claude Code will branch → fix → run gates → commit → push → open PR, then pause for your review before moving to the next finding.

**Gate behaviour:**
- HIGH findings block the commit — must be fixed before proceeding
- MEDIUM findings warn and require acknowledgement
- LOW findings are logged and allowed

---

## Running the review — claude.ai web console

The web console cannot run shell commands or push to git, so it handles the review phase only. Use the CLI for the PR creation phase.

### One-time Project setup

1. Go to **claude.ai → Projects → New Project**, name it `CyberFeed Security Review`
2. In **Project Instructions**, paste the full contents of CLAUDE.md
3. Upload Security.MD as a **Project File**

All conversations in this project will have both files loaded automatically.

### Pass 1

Start a new conversation in the project:

```
The repository is at https://github.com/cyberkryption/cyberfeed

Please run Pass 1 of the security review as defined in Security.MD.
Map the codebase, identify entry points, and produce the priority
file list and preliminary findings. Read and report only — no changes.
```

### Pass 2 — sequential (single tab)

Send one message per agent in the same conversation, after Pass 1 completes:

```
Run Agent A from Security.MD — outbound HTTP operations.
Load the anti-patterns reference at:
https://raw.githubusercontent.com/Arcanum-Sec/sec-context/main/ANTI_PATTERNS_BREADTH.md
Scan for SSRF, timeout, redirect, and TLS issues. Read and report only.
```

```
Run Agent B — content parsing and HTML sanitisation.
Check for XSS vectors in feed content handling. Read and report only.
```

```
Run Agent C — HTTP handlers and security headers.
Check rate limiting, CORS, CSP, auth middleware. Read and report only.
```

```
Run Agent D — goroutine and mutex patterns.
Check for race conditions, improper shared state, context leaks.
Read and report only.
```

```
Run Agent E — React frontend.
Check for XSS, unsafe rendering, sensitive data in localStorage,
npm dependency risks. Read and report only.
```

Then consolidate:

```
Consolidate all findings from Agents A–E into a single table:
Severity | File | Line | Anti-pattern | CWE | Agent
Order by severity (HIGH first). Exclude anything already fixed in PRs #77–#82.
```

### Pass 2 — parallel (five tabs)

Run Pass 1 first in one tab to get the priority file list. Then open five tabs simultaneously, all within the same Project. In each tab, paste the Pass 1 findings and assign a single agent role:

```
You are Agent A. Here are the Pass 1 findings: [paste]
Run Agent A from Security.MD on the codebase at
https://github.com/cyberkryption/cyberfeed
Read and report only.
```

Repeat for Agents B through E. When all five complete, open a sixth tab and paste all five outputs:

```
Consolidate these five agent reports into a single findings table
ordered by severity. Exclude anything already fixed in PRs #77–#82.
[paste all five outputs]
```

### Handing off to the CLI for PR creation

Copy the consolidated findings table from the web console. Open a Claude Code CLI session:

```bash
cd ~/cyberfeed
claude
```

Then paste:

```
Here are the security findings from a review of this codebase.
For each HIGH and MEDIUM finding, create a separate branch and PR —
one at a time. After opening each PR, pause and wait for me to review
and merge it before starting the next fix. Use branch naming
security/fix-<cwe>-<short-description>, run all three CLAUDE.md gates
before committing, use the security commit type, and include the finding
details (file, line, CWE, severity, suggested fix) in the PR body.
Start with the highest severity finding.

[paste findings table]
```

---

## Comparison

| | CLI `/security-review` | Web console (5 tabs) |
|---|---|---|
| Parallelism | Automatic | Manual (open 5 tabs) |
| Code access | Direct filesystem | Paste files or GitHub URL |
| Consolidation | Automatic | Manual (paste into 6th tab) |
| Gate enforcement | Automatic | Not available |
| PR creation | Automatic | Not available — use CLI |
| Re-run effort | `/security-review` | Re-paste context each time |

---

## What the CLAUDE.md gates enforce on every commit

**Gate 1 — Lint**
```bash
golangci-lint run --fix --timeout=5m
```

**Gate 2 — Tests**
```bash
go test ./...
```

**Gate 3 — Security**
```bash
golangci-lint run --enable gosec --timeout=5m
```
Followed by a manual check of staged files against the ANTI_PATTERNS_BREADTH.md reference.

All three gates must pass before `git commit` runs. HIGH severity findings block the commit entirely.
