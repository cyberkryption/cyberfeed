package fetcher

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	fetchTimeout = 15 * time.Second
	userAgent    = "CyberFeedAggregator/1.0 (+https://github.com/cyberfeed)"
)

// httpClient is shared across all workers so TCP connections are reused.
var httpClient = &http.Client{
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return fmt.Errorf("too many redirects")
		}
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

// fetch performs the HTTP GET and parses the feed body.
func fetch(ctx context.Context, cfg FeedConfig) ([]FeedItem, error) {
	ctx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.URL, nil)
	if err != nil {
		return nil, fmt.Errorf("create request for %s: %w", cfg.Name, err)
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", cfg.Name, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("fetch %s: unexpected status %d", cfg.Name, resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20)) // 5 MB limit
	if err != nil {
		return nil, fmt.Errorf("read body for %s: %w", cfg.Name, err)
	}

	items, err := parseXML(body, cfg)
	if err != nil {
		return nil, fmt.Errorf("parse feed %s: %w", cfg.Name, err)
	}
	return items, nil
}
