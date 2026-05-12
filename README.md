# CyberFeed

A multi-threaded cybersecurity RSS aggregator. Pulls 12 security feeds concurrently,
each in its own goroutine, and serves them via a React+Mantine web UI as a **single binary**.

## Architecture

```
cmd/server/
├── main.go                  — Entry point; wires aggregator → server
└── web/                     — React frontend (embedded into the binary)
    ├── src/
    │   ├── App.tsx
    │   ├── components/
    │   │   ├── Header.tsx
    │   │   ├── SourcesSidebar.tsx
    │   │   ├── FeedCard.tsx
    │   │   └── Toolbar.tsx
    │   └── hooks/
    │       └── useFeeds.ts
    └── dist/                — Built output, embedded via //go:embed

internal/
├── fetcher/
│   ├── types.go             — FeedConfig, FeedItem, FeedResult, DefaultFeeds
│   ├── worker.go            — One goroutine per feed, communicates via channel
│   └── parser.go            — RSS 2.0 + Atom XML parser (stdlib only)
├── aggregator/
│   └── aggregator.go        — Spawns workers, collects results, caches snapshot
└── server/
    └── server.go            — HTTP server; /api/feeds, /api/health, SPA fallback
```

## Concurrency model

```
main goroutine
  └── StartAutoRefresh goroutine
        ├── Worker goroutine  (feed 1)  ─┐
        ├── Worker goroutine  (feed 2)   │
        ├── ...                          ├── results chan<- FeedResult
        └── Worker goroutine  (feed 12) ─┘
              collected → sorted → stored as Snapshot (RWMutex)
```

Each feed runs in its own goroutine. Results flow back to the aggregator via a
buffered channel. The aggregator stores the snapshot under a `sync.RWMutex`
so the HTTP handler never blocks the refresh cycle.

## Feeds

| Source | URL |
|--------|-----|
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

## Building

### Prerequisites

- Go 1.22+
- Node.js 18+ and npm

### Build

```bash
./build.sh
```

Or manually:

```bash
# 1. Build the React frontend
cd cmd/server/web
npm install
npm run build
cd ../../..

# 2. Build the Go binary (embeds the dist/ folder)
go build -o cyberfeed ./cmd/server
```

### Run

```bash
./cyberfeed
```

Then open **http://localhost:8888**

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/feeds` | Returns all items, sources, and last-updated timestamp |
| `GET /api/health` | Health check |

## Features

- 🔄 **Auto-refresh** every 15 minutes (server-side)
- 🔍 **Full-text search** across title, description, author, categories
- 🏷️ **Filter by source** via sidebar
- 📊 **Sort** by date or source
- 🌙 **Dark / light mode** toggle
- 🆕 **"NEW" badge** on items published within the last 24 hours
- ✅ **Source health** shown in sidebar with error details on hover
