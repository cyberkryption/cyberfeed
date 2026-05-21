# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## 5. Verification Gates (run before every commit)

Do not run `git commit` until all three gates pass. Fix failures and re-run the failing gate before proceeding.

### Gate 1 — Lint
```bash
golangci-lint run --fix --timeout=5m
```
- Auto-fix what can be fixed, then re-run until clean.
- All errors must be resolved. Warnings should be reviewed.

### Gate 2 — Unit tests
```bash
go test ./...
```
- All existing tests must pass.
- For every new exported function, write at least one happy path and one edge case test.
- If coverage drops below the project baseline, add missing tests before proceeding.

### Gate 3 — Security analysis

**Step 1:** Run gosec
```bash
golangci-lint run --enable gosec --timeout=5m
```

**Step 2:** Fetch and review all staged Go files against the sec-context anti-patterns reference:
https://raw.githubusercontent.com/Arcanum-Sec/sec-context/main/ANTI_PATTERNS_BREADTH.md

The full 25+ pattern list is in that document. At minimum check for: dependency hallucination, hardcoded secrets, SQL injection, command injection, missing input validation, and auth failures.

**Step 3:** For each issue found output: file/line, anti-pattern name, CWE ref, severity (HIGH/MEDIUM/LOW), and suggested fix.

**Gate result:** HIGH → block commit. MEDIUM → warn, require acknowledgement. LOW → log and allow.

**Step 4:** Once all gates pass, output before committing:
```
Gate 1 (lint):     PASS
Gate 2 (tests):    PASS — N tests, N new tests added
Gate 3 (security): PASS — N issues found, N fixed, N acknowledged
Files changed: ...
```

---

## 6. Dependency Hallucination Guard

**Verify every package before importing it.**

- Confirm the package exists at https://pkg.go.dev before adding any import.
- The import path must be exact — a near-miss can resolve to a malicious package.
- Run `go mod tidy` after adding and verify the resolved module matches what you intended.
- Never add an import you cannot verify. If uncertain, ask.

## 7. Go Error Handling

**Errors must be handled explicitly. Never swallowed silently.**

- Never use `_ = someFunc()` to discard an error without a comment explaining why it is safe.
- Always wrap errors with context: `fmt.Errorf("operation: %w", err)`.
- Do not log an error and also return it — pick one.
- Every error return path must leave a trace in either the log or the error chain.

## 8. Interface Discipline

**Define interfaces at the point of use, not the point of implementation.**

- Only define an interface when you have two or more concrete implementations, or need a test mock.
- Interfaces belong in the package that consumes them, not the package that implements them.
- Keep interfaces small — prefer single-method interfaces where possible.
- If you only have one implementation and no mock, you don't need the interface yet.

## 9. Context Propagation

**`context.Context` must flow from the entry point down. Never created mid-stack.**

- Every function doing I/O must accept `ctx context.Context` as its first parameter.
- Never call `context.Background()` inside a function that received a context from its caller.
- `context.Background()` is only valid at entry points: `main()`, top-level handlers, test setup.
- `context.TODO()` is never committable — it is a placeholder only.

## 10. Commit Message Format

**Every commit must follow conventional commits.**

Format: `<type>(<scope>): <short summary>` — 72 char max, imperative mood, no full stop.

Types: `feat` · `fix` · `test` · `refactor` · `chore` · `docs` · `security`

- Use `security` for all Gate 3 remediations so they are identifiable in the log.
- Reference issues in the footer: `Closes #N` or `Refs #N`.
- Breaking changes must have `BREAKING CHANGE:` in the footer.

## 11. Commit Behaviour

After all three gates pass and the summary is output, run `git commit` automatically.

- Do not ask for confirmation before committing.
- Do not run `git push` — committing locally is the final step. The developer owns the push to the remote.
- Use the conventional commit format defined in Section 10.
- If any gate fails, fix the issue and re-run that gate before committing. Never commit with a failed gate.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, clarifying questions come before implementation rather than after mistakes, no HIGH severity security findings reach the remote, and every commit in the log is readable and traceable.
