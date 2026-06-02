# CyberFeed

A multi-threaded cybersecurity RSS aggregator. Pulls 19 security feeds concurrently,
each in its own goroutine, and serves them via a React + Mantine web UI as a **single static binary**.

![Dark mode dashboard](docs/screenshot.png)

## Features

- **Live ticker** — Critical CVEs scroll across a ticker bar at the top; speed is adjustable from the header
- **Stats panel** — Resizable right-hand panel with six charts covering CVE trends, CVSS severity, source activity, and source health
- **Drag-to-reorder charts** — Grip-handle drag within CVE and General chart sections
- **Split sidebar** — Sources divided into NEWS and THREAT INTEL sections; toggle individual sources on/off
- **Full-text search** — Searches title, description, author, source, and categories
- **Sort** by date or source
- **Dark / light mode** toggle
- **"NEW" badge** on items published within the last 24 hours
- **Source health** shown in the sidebar with error details on hover
- **Auto-refresh** configurable per feed or globally (default 20 minutes), with a countdown and progress bar in the header
- **Feed management** — Add, remove, enable/disable, and set per-feed refresh intervals via the admin UI
- **Authentication** — Session-based login with rate-limited brute-force protection
- **Security audit log** — All security events (logins, SSRF blocks, feed changes) written to an NDJSON file
- **XSS-safe** — All feed HTML is sanitised with `bluemonday` before serving

## Stats panel charts

| Chart | Section | Description |
|-------|---------|-------------|
| CVE Daily Volume | CVE | Stacked bar chart — Critical / High / Unknown by day (last 7 days) |
| CVSS Distribution | CVE | Severity scorecard showing counts across 5 bands (Critical → None) |
| Top Affected Products | CVE | Horizontal bar — top 10 product/category tags from CVE feed |
| Articles per Source | General | Bars per news source (threat intel feeds excluded) |
| Articles (14 days) | General | Area chart of news article volume over 14 days |
| Source Health | General | Two donuts — NEWS and THREAT INTEL — showing healthy vs failing sources |

## Feeds

### News

| Source | Domain |
|--------|--------|
| CVE High and Critical | cvefeed.io |
| CVE Feeds Newsroom | cvefeed.io |
| NCSC Threat Reports | ncsc.gov.uk |
| Microsoft Security Blog | microsoft.com |
| Risky Business | risky.biz |
| SANS Internet Storm Center | isc.sans.edu |
| PortSwigger Research | portswigger.net |
| AWS Security Blog | aws.amazon.com |
| TrustedSec | trustedsec.com |
| Snyk Security | snyk.io |
| Industrial Cyber | industrialcyber.co |
| Didier Stevens Blog | blog.didierstevens.com |

### Threat Intel (C2 Indicator Feeds)

| Source | Format |
|--------|--------|
| C2 DNS Domains | CSV |
| C2 IPs | CSV |
| C2 IP:Port | CSV |
| C2 Domains | CSV |
| C2 Domains (URL filtered) | CSV |
| C2 Domains with URL | CSV |
| C2 Domains with URL+IP | CSV |

## Architecture

```
cmd/server/
├── main.go                  — Entry point; wires aggregator → server
└── web/                     — React frontend (embedded into the binary)
    ├── src/
    │   ├── App.tsx          — Root layout, panel split, state
    │   ├── charts.ts        — Chart definitions (id, label, section)
    │   ├── types.ts         — Shared TypeScript types
    │   ├── components/
    │   │   ├── Header.tsx         — Logo, badges, countdown, ticker speed slider
    │   │   ├── TickerBar.tsx      — Scrolling Critical CVE ticker
    │   │   ├── SourcesSidebar.tsx — NEWS / THREAT INTEL split sidebar
    │   │   ├── Toolbar.tsx        — Search, sort, chart visibility toggles
    │   │   ├── FeedCard.tsx       — Individual feed item card
    │   │   ├── FeedAdminModal.tsx — Add/remove/configure feeds
    │   │   └── StatsPanel.tsx     — All six charts with drag-to-reorder
    │   └── hooks/
    │       ├── useFeeds.ts        — Auto-polling /api/feeds every 20 minutes
    │       └── useFeedAdmin.ts    — Feed management API calls
    └── dist/                — Built output, embedded via //go:embed

internal/
├── fetcher/
│   ├── types.go             — FeedConfig, FeedItem, FeedResult, DefaultFeeds
│   ├── worker.go            — One goroutine per feed, communicates via channel
│   ├── parser.go            — RSS 2.0 + Atom + CSV parser; bluemonday sanitisation
│   └── ssrf.go              — ValidateFeedURL; blocks private/reserved addresses
├── aggregator/
│   └── aggregator.go        — Spawns workers, collects results, caches snapshot
├── server/
│   └── server.go            — HTTP server; auth, feed admin, SPA fallback
├── auth/
│   └── ...                  — Session management, bcrypt passwords, rate limiting
├── audit/
│   └── audit.go             — NDJSON security event log
├── store/
│   └── ...                  — SQLite persistence (feeds, sessions, snapshot)
└── logrotate/
    └── logrotate.go         — Daily-rotating log files
```

## Concurrency model

```
main goroutine
  └── StartAutoRefresh goroutine
        ├── Worker goroutine  (feed 1)  ─┐
        ├── Worker goroutine  (feed 2)   │
        ├── ...                          ├── results chan<- FeedResult
        └── Worker goroutine  (feed N)  ─┘
              collected → sorted → stored as Snapshot (RWMutex)
```

Each feed runs in its own goroutine. Results flow back to the aggregator via a
buffered channel. The aggregator stores the snapshot under a `sync.RWMutex`
so the HTTP handler never blocks the refresh cycle.

## Building

### Prerequisites

- Go 1.22+
- Node.js 18+ and npm

### Linux / macOS

```bash
./build.sh
```

The script builds the React frontend, then compiles the Go binary with size
optimisation flags (`-ldflags="-s -w" -trimpath`, `CGO_ENABLED=0`), producing
a fully static binary roughly 25–35 % smaller than an unoptimised build.

### Windows

```powershell
.\install.ps1
```

### Manual build

```bash
# 1. Build the React frontend
cd cmd/server/web
npm install
npm run build
cd ../../..

# 2. Build the Go binary (embeds the dist/ folder)
CGO_ENABLED=0 go build -ldflags="-s -w" -trimpath -o cyberfeed ./cmd/server
```

## First run

On first start, no user accounts exist. Set the admin password via environment variable:

```bash
# Linux / macOS
CYBERFEED_ADMIN_PASSWORD=yourpassword ./cyberfeed

# Windows PowerShell
$env:CYBERFEED_ADMIN_PASSWORD="yourpassword"
.\cyberfeed.exe
```

The password is hashed with bcrypt and the environment variable is cleared from
memory immediately after startup. On subsequent starts, setting
`CYBERFEED_ADMIN_PASSWORD` will update the named user's password.

## Configuration

All configuration is via environment variables. Defaults are shown in parentheses.

| Variable | Default | Description |
|----------|---------|-------------|
| `CYBERFEED_ADDR` | `:8888` | Listen address |
| `CYBERFEED_ADMIN_USERNAME` | `admin` | Admin username for first-run setup |
| `CYBERFEED_ADMIN_PASSWORD` | _(required on first run)_ | Admin password; cleared from memory after startup |
| `CYBERFEED_DB` | `cyberfeed.db` | SQLite database path |
| `CYBERFEED_REFRESH_INTERVAL` | `20m` | Global feed refresh interval (Go duration, e.g. `30m`, `1h`) |
| `CYBERFEED_AUDIT_LOG` | `security-events.json` | NDJSON security event log path |
| `CYBERFEED_LOG_DIR` | `logs` | Directory for daily-rotating log files |
| `CYBERFEED_TRUSTED_PROXIES` | _(none)_ | Comma-separated CIDRs of trusted reverse proxies for `X-Forwarded-For` |

Then open **http://localhost:8888**

## API

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/login` | — | Login; sets session cookie |
| `POST` | `/api/auth/logout` | session | Logout; clears session cookie |
| `GET` | `/api/auth/me` | — | Returns `{"authenticated": true/false, "username": "..."}` |
| `POST` | `/api/auth/change-password` | session | Change the current user's password |

### Data

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/feeds` | session | All feed items, sources, and last-updated timestamp |
| `GET` | `/api/health` | session | Health check |

### Feed admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/admin/feeds` | session | List all configured feeds |
| `POST` | `/api/admin/feeds` | session | Add a feed (`name`, `url`, `parser`, `category`, `refreshInterval`) |
| `DELETE` | `/api/admin/feeds/{name}` | session | Delete a feed |
| `PATCH` | `/api/admin/feeds/{name}` | session | Enable/disable a feed or set its refresh interval |
| `POST` | `/api/admin/refresh` | session | Trigger an immediate server-side refresh (rate-limited to once per 30 s) |

## Security

- **Authentication** — Session cookies (`HttpOnly`, `Secure`, `SameSite=Strict`); bcrypt password hashing; sessions stored in SQLite
- **Rate limiting** — Login endpoint rate-limited per IP; brute-force lockout with `Retry-After` response header
- **SSRF protection** — `ValidateFeedURL` blocks private, loopback, link-local, and reserved address ranges at feed-add time and again at dial time (DNS-rebinding prevention)
- **XSS protection** — All feed content sanitised with [`bluemonday`](https://github.com/microcosm-cc/bluemonday) strict policy; titles, authors, and categories stripped as well as descriptions
- **Security headers** — `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` on every response
- **Audit log** — Login successes/failures, rate-limit events, SSRF blocks, and feed changes written to an NDJSON file
- **Static binary** — `CGO_ENABLED=0`; no external runtime dependencies
