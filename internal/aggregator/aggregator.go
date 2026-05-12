package aggregator

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/cyberkryption/cyberfeed/internal/fetcher"
)

// FeedStatus tracks per-source metadata.
type FeedStatus struct {
	Name      string    `json:"name"`
	URL       string    `json:"url"`
	ItemCount int       `json:"itemCount"`
	LastFetch time.Time `json:"lastFetch"`
	Error     string    `json:"error,omitempty"`
	OK        bool      `json:"ok"`
}

// Snapshot is the complete aggregated state served to clients.
type Snapshot struct {
	Items     []fetcher.FeedItem `json:"items"`
	Sources   []FeedStatus       `json:"sources"`
	UpdatedAt time.Time          `json:"updatedAt"`
}

// Aggregator owns the worker pool and the cached snapshot.
type Aggregator struct {
	feeds    []fetcher.FeedConfig
	logger   *slog.Logger
	mu       sync.RWMutex
	snapshot Snapshot
}

// New creates an Aggregator for the given feeds.
func New(feeds []fetcher.FeedConfig, logger *slog.Logger) *Aggregator {
	return &Aggregator{
		feeds:  feeds,
		logger: logger,
	}
}

// Snapshot returns a read-only copy of the current aggregated data.
func (a *Aggregator) Snapshot() Snapshot {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.snapshot
}

// Refresh spawns one goroutine per feed, collects results, and updates
// the internal snapshot atomically.
func (a *Aggregator) Refresh(ctx context.Context) error {
	results := make(chan fetcher.FeedResult, len(a.feeds))

	for _, cfg := range a.feeds {
		go fetcher.Worker(ctx, cfg, results)
	}

	allItems := make([]fetcher.FeedItem, 0, len(a.feeds)*20)
	statuses := make([]FeedStatus, 0, len(a.feeds))

	for range a.feeds {
		select {
		case res := <-results:
			status := FeedStatus{
				Name:      res.Config.Name,
				URL:       res.Config.URL,
				LastFetch: time.Now().UTC(),
			}
			if res.Err != nil {
				status.Error = res.Err.Error()
				status.OK = false
				a.logger.Warn("feed fetch error",
					"feed", res.Config.Name,
					"error", res.Err,
				)
			} else {
				status.OK = true
				status.ItemCount = len(res.Items)
				allItems = append(allItems, res.Items...)
				a.logger.Info("feed fetched",
					"feed", res.Config.Name,
					"items", len(res.Items),
				)
			}
			statuses = append(statuses, status)

		case <-ctx.Done():
			return fmt.Errorf("refresh cancelled: %w", ctx.Err())
		}
	}

	sort.Slice(allItems, func(i, j int) bool {
		ti, tj := allItems[i].Published, allItems[j].Published
		// Zero-time items (no pubDate) sink to the bottom.
		if ti.IsZero() != tj.IsZero() {
			return tj.IsZero()
		}
		return ti.After(tj)
	})

	// Sort sources: RSS/Atom feeds alphabetically first, CSV indicator feeds
	// alphabetically last (detected by .csv URL extension).
	isCSV := func(s FeedStatus) bool {
		return strings.HasSuffix(strings.ToLower(s.URL), ".csv")
	}
	sort.Slice(statuses, func(i, j int) bool {
		iCSV, jCSV := isCSV(statuses[i]), isCSV(statuses[j])
		if iCSV != jCSV {
			return jCSV // non-CSV before CSV
		}
		return statuses[i].Name < statuses[j].Name
	})

	a.mu.Lock()
	a.snapshot = Snapshot{
		Items:     allItems,
		Sources:   statuses,
		UpdatedAt: time.Now().UTC(),
	}
	a.mu.Unlock()

	return nil
}

// StartAutoRefresh blocks and periodically calls Refresh on the given interval.
// Cancel ctx to stop.
func (a *Aggregator) StartAutoRefresh(ctx context.Context, interval time.Duration) {
	a.logger.Info("starting auto-refresh", "interval", interval)

	if err := a.Refresh(ctx); err != nil {
		a.logger.Error("initial refresh failed", "error", err)
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := a.Refresh(ctx); err != nil {
				a.logger.Error("periodic refresh failed", "error", err)
			}
		case <-ctx.Done():
			a.logger.Info("auto-refresh stopped")
			return
		}
	}
}
