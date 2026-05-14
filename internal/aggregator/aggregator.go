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
	"github.com/cyberkryption/cyberfeed/internal/store"
)

// FeedStatus tracks per-source metadata.
type FeedStatus struct {
	Name      string    `json:"name"`
	URL       string    `json:"url"`
	ItemCount int       `json:"itemCount"`
	LastFetch time.Time `json:"lastFetch"`
	Error     string    `json:"error,omitempty"`
	OK        bool      `json:"ok"`
	Category  string    `json:"category"` // "auto" | "news" | "threat_intel"
	Parser    string    `json:"parser"`   // "auto" | "xml" | "csv" | "json"
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
	store    *store.Store
	mu       sync.RWMutex
	snapshot Snapshot
}

// New creates an Aggregator for the given feeds. st may be nil to disable persistence.
func New(feeds []fetcher.FeedConfig, logger *slog.Logger, st *store.Store) *Aggregator {
	a := &Aggregator{
		feeds:  feeds,
		logger: logger,
		store:  st,
	}
	if st != nil {
		a.loadFromStore()
	}
	return a
}

// loadFromStore populates the in-memory snapshot from the last persisted state.
func (a *Aggregator) loadFromStore() {
	items, records, updatedAt, err := a.store.LoadSnapshot()
	if err != nil {
		a.logger.Warn("failed to load snapshot from store", "error", err)
		return
	}
	if len(items) == 0 {
		return
	}
	statuses := make([]FeedStatus, len(records))
	for i, r := range records {
		statuses[i] = FeedStatus{
			Name:      r.Name,
			URL:       r.URL,
			ItemCount: r.ItemCount,
			LastFetch: r.LastFetch,
			Error:     r.Error,
			OK:        r.OK,
		}
	}
	a.mu.Lock()
	a.snapshot = Snapshot{Items: items, Sources: statuses, UpdatedAt: updatedAt}
	a.mu.Unlock()
	a.logger.Info("loaded snapshot from store", "items", len(items), "sources", len(records))
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
	feeds := a.feeds // fallback to static list
	if a.store != nil {
		if dynamic, err := store.GetEnabledFeedConfigs(a.store.DB()); err == nil && len(dynamic) > 0 {
			feeds = dynamic
		}
	}

	results := make(chan fetcher.FeedResult, len(feeds))

	for _, cfg := range feeds {
		go fetcher.Worker(ctx, cfg, results)
	}

	allItems := make([]fetcher.FeedItem, 0, len(feeds)*20)
	statuses := make([]FeedStatus, 0, len(feeds))

	for range feeds {
		select {
		case res := <-results:
			status := FeedStatus{
				Name:      res.Config.Name,
				URL:       res.Config.URL,
				LastFetch: time.Now().UTC(),
				Category:  res.Config.Category,
				Parser:    res.Config.Parser,
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

	// Deduplicate: same link (or same title when link is absent) across sources.
	// CSV/threat-intel feeds include source in the key so the same indicator
	// appearing in multiple CSV feeds is not collapsed into a single entry.
	// RSS news feeds keep a plain link key so cross-source duplicates are removed.
	isCSVURL := func(u string) bool {
		return strings.HasSuffix(strings.ToLower(strings.TrimSpace(u)), ".csv")
	}
	seen := make(map[string]struct{}, len(allItems))
	deduped := allItems[:0]
	for _, item := range allItems {
		key := strings.ToLower(strings.TrimSpace(item.Link))
		if key == "" {
			key = "title:" + strings.ToLower(strings.TrimSpace(item.Title))
		}
		if key == "" {
			deduped = append(deduped, item)
			continue
		}
		if isCSVURL(item.SourceURL) {
			key = strings.ToLower(item.Source) + "|" + key
		}
		if _, exists := seen[key]; !exists {
			seen[key] = struct{}{}
			deduped = append(deduped, item)
		}
	}
	allItems = deduped

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

	updatedAt := time.Now().UTC()

	a.mu.Lock()
	a.snapshot = Snapshot{
		Items:     allItems,
		Sources:   statuses,
		UpdatedAt: updatedAt,
	}
	a.mu.Unlock()

	if a.store != nil {
		records := make([]store.SourceRecord, len(statuses))
		for i, s := range statuses {
			records[i] = store.SourceRecord{
				Name:      s.Name,
				URL:       s.URL,
				ItemCount: s.ItemCount,
				LastFetch: s.LastFetch,
				Error:     s.Error,
				OK:        s.OK,
			}
		}
		if err := a.store.SaveSnapshot(allItems, records, updatedAt); err != nil {
			a.logger.Warn("failed to persist snapshot", "error", err)
		} else {
			a.logger.Info("snapshot persisted to store", "items", len(allItems))
		}
	}

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
