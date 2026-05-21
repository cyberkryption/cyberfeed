# CLAUDE.md — CyberFeed Security Review

Two-pass security review for github.com/cyberkryption/cyberfeed.
A cybersecurity RSS aggregator: Go backend fetching 19 concurrent feeds,
React + Mantine frontend, served as a single static binary.

**Do not make any code changes during this review.**
**Do not commit anything. Read and report only.**

Anti-patterns reference (load before starting either pass):
https://raw.githubusercontent.com/Arcanum-Sec/sec-context/main/ANTI_PATTERNS_BREADTH.md

---

## Pass 1 — Architecture & data flow review (single session)

Run this pass first. Its goal is to map how untrusted data moves through
the application and identify cross-cutting vulnerabilities that span files.

### Step 1: Map the codebase
```bash
find . -name "*.go" | sort
wc -l $(find . -name "*.go")
```
List every Go file and its line count. Note the structure before reading any code.

### Step 2: Read entry points
Read the following in order — do not skip ahead:
1. `go.mod` — note all dependencies and their versions
2. `main.go` — identify: HTTP server setup, route definitions, middleware,
   goroutine launch points, feed URL sources, and any config loading

### Step 3: Architecture analysis
After reading, answer each question explicitly:

**Feed fetching**
- Where are the 19 feed URLs defined? Are they hardcoded, config-driven, or user-supplied?
- Can a user influence which URLs are fetched? (SSRF risk)
- Is there a timeout on outbound HTTP requests to feed sources?
- Is there a maximum response size limit? (memory exhaustion risk)
- Are redirects followed? If so, is there a redirect limit?

**Content sanitisation**
- The project uses `douceur` and likely `bluemonday` — where exactly are they called?
- Is sanitisation applied before storage, before rendering, or both?
- Are there any paths where RSS feed content reaches the frontend unsanitised?
- Are feed titles, authors, and categories sanitised as well as descriptions?

**Concurrency**
- Are shared data structures (feed store, cache) protected by a mutex or channel?
- Is there a race condition risk between goroutines writing feed data?
- Run: `go build -race ./...` and report any detected races

**HTTP server**
- Are there rate limits on any endpoints?
- Are CORS headers set? If so, is the origin validated or is it wildcard?
- Are there any endpoints that accept user input? If so, is input validated?
- What is the Content-Security-Policy header, if any?

**Secrets and configuration**
- Run: `grep -rn "api_key\|apikey\|secret\|password\|token\|bearer" . --include="*.go" -i`
- Are any credentials present in source, config files, or `.env` files committed to the repo?

**Dependencies**
- For each dependency in `go.mod`, verify it exists on pkg.go.dev
- Run: `go mod verify`
- Run: `govulncheck ./...` (install with `go install golang.org/x/vuln/cmd/govulncheck@latest`)

### Step 4: Pass 1 report
Produce a structured report:

```
PASS 1 — ARCHITECTURE FINDINGS
================================
SSRF risk:         [findings or NONE]
XSS / sanitisation:[findings or NONE]
Concurrency:       [findings or NONE]
Rate limiting:     [findings or NONE]
CORS:              [findings or NONE]
Secrets:           [findings or NONE]
Dependencies:      [findings or NONE]
Race detector:     [output of go build -race]
Vuln check:        [output of govulncheck]

Priority order for Pass 2 (highest risk files first):
1. [file] — reason
2. [file] — reason
...
```

Do not proceed to Pass 2 until this report is complete.

---

## Pass 2 — File-by-file anti-pattern scan (parallel sessions)

Launch one background agent per file group below. Each agent must load the
sec-context anti-patterns reference before reviewing its assigned files.

### Agent commands (run from repo root)

```bash
# Agent A — feed fetching and HTTP client (highest risk: SSRF, memory exhaustion)
claude --bg "Load https://raw.githubusercontent.com/Arcanum-Sec/sec-context/main/ANTI_PATTERNS_BREADTH.md
then review all Go code related to outbound HTTP feed fetching in this repo.
Check for: SSRF, missing timeouts, missing response size limits, unchecked
redirects, missing TLS verification, error swallowing. Do not modify any files.
Output findings as: FILE | LINE | ANTI-PATTERN | CWE | SEVERITY | DESCRIPTION"

# Agent B — content sanitisation (high risk: XSS)
claude --bg "Load https://raw.githubusercontent.com/Arcanum-Sec/sec-context/main/ANTI_PATTERNS_BREADTH.md
then review all Go code related to RSS content parsing and HTML sanitisation.
Check for: unsanitised content reaching output, partial sanitisation (titles/
authors missed), bypass risks in douceur/bluemonday usage, template injection.
Do not modify any files.
Output findings as: FILE | LINE | ANTI-PATTERN | CWE | SEVERITY | DESCRIPTION"

# Agent C — HTTP handlers and server config (medium risk: headers, input validation)
claude --bg "Load https://raw.githubusercontent.com/Arcanum-Sec/sec-context/main/ANTI_PATTERNS_BREADTH.md
then review all Go HTTP handler and server configuration code in this repo.
Check for: missing security headers (CSP, X-Frame-Options, X-Content-Type),
missing rate limiting, overly permissive CORS, user input not validated,
verbose error messages leaking internals. Do not modify any files.
Output findings as: FILE | LINE | ANTI-PATTERN | CWE | SEVERITY | DESCRIPTION"

# Agent D — concurrency and data structures (medium risk: race conditions)
claude --bg "Load https://raw.githubusercontent.com/Arcanum-Sec/sec-context/main/ANTI_PATTERNS_BREADTH.md
then review all Go goroutine, channel, mutex, and shared state usage in this repo.
Check for: unprotected shared maps/slices, missing mutex locks, goroutine leaks,
context not propagated into goroutines, missing cancellation on shutdown.
Do not modify any files.
Output findings as: FILE | LINE | ANTI-PATTERN | CWE | SEVERITY | DESCRIPTION"

# Agent E — frontend (React/JS — XSS, dependency risks)
claude --bg "Load https://raw.githubusercontent.com/Arcanum-Sec/sec-context/main/ANTI_PATTERNS_BREADTH.md
then review all frontend JavaScript/TypeScript/React code in this repo.
Check for: dangerouslySetInnerHTML usage, unescaped feed content rendered to DOM,
outdated npm dependencies (run npm audit), hardcoded URLs or API keys,
missing input sanitisation on search. Do not modify any files.
Output findings as: FILE | LINE | ANTI-PATTERN | CWE | SEVERITY | DESCRIPTION"
```

### Pass 2 consolidated report

After all agents complete, consolidate into a single findings table:

```
PASS 2 — CONSOLIDATED FINDINGS
================================
| # | File | Line | Anti-pattern | CWE | Severity | Description |
|---|------|------|-------------|-----|----------|-------------|
| 1 | ...  | ...  | ...         | ... | HIGH     | ...         |

SUMMARY
-------
HIGH findings:    N  → must fix before next commit
MEDIUM findings:  N  → fix within this sprint
LOW findings:     N  → log and schedule

RECOMMENDED FIX ORDER:
1. [highest severity finding and suggested fix]
2. ...
```

---

## After the review

Once both passes are complete and the consolidated report is produced:
1. Create a GitHub issue for each HIGH finding with the label `security`
2. Do not commit any fixes until the full report is reviewed and prioritised
3. Apply fixes one finding at a time, each with its own commit using type `security`
4. Re-run `golangci-lint run --enable gosec` after each fix to confirm resolution