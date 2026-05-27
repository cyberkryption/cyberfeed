package fetcher

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

const (
	fetchTimeout    = 15 * time.Second
	csvFetchTimeout = 45 * time.Second // larger files need more time
	rssBodyLimit    = 5 << 20          // 5 MB — sufficient for XML/Atom feeds
	csvBodyLimit    = 25 << 20         // 25 MB — C2 intel CSVs can be large
	csvCacheDir     = "data/c2feeds"
	userAgent       = "CyberFeedAggregator/1.0 (+https://github.com/cyberfeed)"
)

// httpClient is shared across all workers so TCP connections are reused.
// It uses a custom transport whose DialContext blocks private/reserved
// addresses at connection time, preventing DNS-rebinding attacks.
var httpClient = &http.Client{
	Transport: &http.Transport{
		DialContext: safeDialContext,
	},
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return fmt.Errorf("too many redirects")
		}
		// Block non-http(s) redirect targets (javascript:, file:, data:, etc.).
		// Private-IP protection is handled by safeDialContext at connection time,
		// which avoids false positives from pre-dial DNS lookups on CDN hostnames.
		scheme := req.URL.Scheme
		if scheme != "http" && scheme != "https" {
			return fmt.Errorf("redirect blocked: scheme %q not allowed", scheme)
		}
		slog.Debug("following redirect", "url", req.URL.String(), "hop", len(via))
		return nil
	},
}

// Worker fetches a single feed and sends the result on the provided channel.
// It is designed to run as a goroutine. The context allows cancellation.
func Worker(ctx context.Context, cfg FeedConfig, results chan<- FeedResult) {
	items, err := fetch(ctx, cfg)
	results <- FeedResult{
		Config: cfg,
		Items:  items,
		Err:    err,
	}
}

// fetch dispatches to the correct parser. cfg.Parser overrides URL-based
// auto-detection: "csv" forces CSV, "json" forces JSON, "xml" forces RSS/Atom.
// "auto" (or empty) infers from the URL extension.
func fetch(ctx context.Context, cfg FeedConfig) ([]FeedItem, error) {
	switch cfg.Parser {
	case "csv":
		return fetchCSV(ctx, cfg)
	case "json":
		return fetchJSON(ctx, cfg)
	case "xml":
		return fetchXML(ctx, cfg)
	default:
		lower := strings.ToLower(cfg.URL)
		if isCSVURL(cfg.URL) {
			return fetchCSV(ctx, cfg)
		}
		if strings.HasSuffix(lower, ".json") {
			return fetchJSON(ctx, cfg)
		}
		return fetchXML(ctx, cfg)
	}
}

// fetchJSON downloads a JSON threat-intel file, caches it, and parses it.
func fetchJSON(ctx context.Context, cfg FeedConfig) ([]FeedItem, error) {
	cachePath := filepath.Join(csvCacheDir, csvFilename(cfg.URL))

	body, err := httpGet(ctx, cfg.URL, csvBodyLimit, csvFetchTimeout)
	if err != nil {
		if cached, cacheErr := os.ReadFile(cachePath); cacheErr == nil { //nolint:gosec // G304: cachePath is constructed from a fixed dir and csvFilename(url), which uses url.Parse+path.Base to strip traversal — not user-controlled
			slog.Warn("JSON fetch failed, using cached copy", "feed", cfg.Name, "error", err)
			body = cached
		} else {
			return nil, fmt.Errorf("fetch %s failed and no local cache available: %w", cfg.Name, err)
		}
	} else {
		if mkErr := os.MkdirAll(csvCacheDir, 0o750); mkErr == nil {
			if wErr := os.WriteFile(cachePath, body, 0o600); wErr != nil {
				slog.Warn("failed to cache JSON feed", "feed", cfg.Name, "path", cachePath, "error", wErr)
			}
		}
	}

	items, err := ParseJSON(cfg.Name, cfg.URL, body)
	if err != nil {
		return nil, fmt.Errorf("parse JSON %s: %w", cfg.Name, err)
	}
	return items, nil
}

// fetchXML downloads and parses an RSS or Atom feed.
// If the response body looks like CSV rather than XML (i.e. it starts with '#',
// which is never a valid XML document start but is used as a column-header
// comment by all C2IntelFeeds files), it falls through to the CSV parser so
// that feeds added to feeds.txt before a binary rebuild still work correctly.
func fetchXML(ctx context.Context, cfg FeedConfig) ([]FeedItem, error) {
	body, err := httpGet(ctx, cfg.URL, rssBodyLimit, fetchTimeout)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", cfg.Name, err)
	}

	// Content-sniff fallback: '#' at the start of a document is never valid XML
	// but is the standard opening byte of every C2IntelFeeds CSV header row.
	if bodyLooksLikeCSV(body) {
		slog.Warn("CSV content detected for non-.csv URL; switching to CSV parser",
			"feed", cfg.Name, "url", cfg.URL)
		items, csvErr := ParseCSV(cfg.Name, cfg.URL, body)
		if csvErr != nil {
			return nil, fmt.Errorf("parse feed %s (sniffed as CSV): %w", cfg.Name, csvErr)
		}
		return items, nil
	}

	items, err := parseXML(body, cfg)
	if err != nil {
		return nil, fmt.Errorf("parse feed %s: %w", cfg.Name, err)
	}
	return items, nil
}

// fetchCSV downloads a CSV threat-intel file, caches it to csvCacheDir, and
// parses it into FeedItems. If the download fails, the last cached copy is used.
func fetchCSV(ctx context.Context, cfg FeedConfig) ([]FeedItem, error) {
	cachePath := filepath.Join(csvCacheDir, csvFilename(cfg.URL))

	body, err := httpGet(ctx, cfg.URL, csvBodyLimit, csvFetchTimeout)
	if err != nil {
		// Fall back to locally cached copy when the remote is unavailable.
		cached, cacheErr := os.ReadFile(cachePath) //nolint:gosec // G304: cachePath is constructed from a fixed dir and csvFilename(url), which uses url.Parse+path.Base to strip traversal — not user-controlled
		if cacheErr != nil {
			return nil, fmt.Errorf("fetch %s failed and no local cache available: %w", cfg.Name, err)
		}
		slog.Warn("CSV fetch failed, using cached copy", "feed", cfg.Name, "error", err)
		body = cached
	} else {
		// Persist fresh copy (best-effort; failures are non-fatal).
		if mkErr := os.MkdirAll(csvCacheDir, 0o750); mkErr == nil {
			if wErr := os.WriteFile(cachePath, body, 0o600); wErr != nil {
				slog.Warn("failed to cache CSV feed", "feed", cfg.Name, "path", cachePath, "error", wErr)
			}
		}
	}

	items, err := ParseCSV(cfg.Name, cfg.URL, body)
	if err != nil {
		return nil, fmt.Errorf("parse CSV %s: %w", cfg.Name, err)
	}
	return items, nil
}

// httpGet performs a GET request and returns the response body up to limit bytes.
func httpGet(ctx context.Context, url string, limit int64, timeout time.Duration) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml, text/csv, */*")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close() //nolint:errcheck

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("unexpected HTTP status %d", resp.StatusCode)
	}

	return io.ReadAll(io.LimitReader(resp.Body, limit))
}

// isCSVURL returns true when the URL path ends with ".csv".
func isCSVURL(u string) bool {
	lower := strings.ToLower(u)
	// Strip query string before checking extension.
	if i := strings.IndexByte(lower, '?'); i >= 0 {
		lower = lower[:i]
	}
	return strings.HasSuffix(lower, ".csv")
}

// csvFilename derives a safe cache filename from a feed URL.
// It parses the URL, takes the base name of the URL path (so query strings,
// fragments, and path traversal components are stripped), and falls back to
// "feed.csv" for any URL that does not yield a usable filename.
func csvFilename(u string) string {
	if parsed, err := url.Parse(u); err == nil {
		if base := path.Base(parsed.Path); base != "" && base != "." && base != ".." {
			return base
		}
	}
	return "feed.csv"
}

// bodyLooksLikeCSV returns true when the body starts with '#', which is never
// a valid XML document opener but is the column-header comment marker used by
// every C2IntelFeeds CSV file.
func bodyLooksLikeCSV(b []byte) bool {
	trimmed := bytes.TrimSpace(b)
	return len(trimmed) > 0 && trimmed[0] == '#'
}
