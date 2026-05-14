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
	feeds     []fetcher.FeedConfig
	logger    *slog.Logger
	store     *store.Store
	mu        sync.RWMutex
	snapshot  Snapshot
	lastFetch map[string]time.Time // keyed by feed name
}

// New creates an Aggregator for the given feeds. st may be nil to disable persistence.
func New(feeds []fetcher.FeedConfig, logger *slog.Logger, st *store.Store) *Aggregator {
	a := &Aggregator{
		feeds:     feeds,
		logger:    logger,
		store:     st,
		lastFetch: make(map[string]time.Time),
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
		// Seed lastFetch so the scheduler doesn't re-fetch everything immediately on restart.
		if !r.LastFetch.IsZero() {
			a.lastFetch[r.Name] = r.LastFetch
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

// activeFeeds returns the current feed list from the DB, falling back to the
// static default list when the store is unavailable or empty.
func (a *Aggregator) activeFeeds() []fetcher.FeedConfig {
	if a.store != nil {
		if dynamic, err := store.GetEnabledFeedConfigs(a.store.DB()); err == nil && len(dynamic) > 0 {
			return dynamic
		}
	}
	return a.feeds
}

// fetchFeeds spawns one goroutine per feed, collects results, and returns the
// combined items and statuses. Returns an error only on context cancellation;
// per-feed HTTP/parse errors are captured in the returned FeedStatus.
func (a *Aggregator) fetchFeeds(ctx context.Context, feeds []fetcher.FeedConfig) ([]fetcher.FeedItem, []FeedStatus, error) {
	results := make(chan fetcher.FeedResult, len(feeds))
	for _, cfg := range feeds {
		go fetcher.Worker(ctx, cfg, results)
	}

	items := make([]fetcher.FeedItem, 0, len(feeds)*20)
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
				a.logger.Warn("feed fetch error", "feed", res.Config.Name, "error", res.Err)
			} else {
				status.OK = true
				status.ItemCount = len(res.Items)
				items = append(items, res.Items...)
				a.logger.Info("feed fetched", "feed", res.Config.Name, "items", len(res.Items))
			}
			statuses = append(statuses, status)
		case <-ctx.Done():
			return nil, nil, fmt.Errorf("refresh cancelled: %w", ctx.Err())
		}
	}
	return items, statuses, nil
}

// isDataFeedURL returns true for .csv and .json URLs (threat-intel data files).
func isDataFeedURL(u string) bool {
	lower := strings.ToLower(strings.TrimSpace(u))
	if i := strings.IndexByte(lower, '?'); i >= 0 {
		lower = lower[:i]
	}
	return strings.HasSuffix(lower, ".csv") || strings.HasSuffix(lower, ".json")
}

// buildSnapshot deduplicates and sorts items and statuses into a ready-to-serve Snapshot.
func buildSnapshot(items []fetcher.FeedItem, statuses []FeedStatus) Snapshot {
	// Deduplicate by link (or title when no link). Data feeds (CSV/JSON) scope
	// the key by source so the same indicator in multiple feeds is preserved.
	seen := make(map[string]struct{}, len(items))
	deduped := items[:0]
	for _, item := range items {
		key := strings.ToLower(strings.TrimSpace(item.Link))
		if key == "" {
			key = "title:" + strings.ToLower(strings.TrimSpace(item.Title))
		}
		if key == "" {
			deduped = append(deduped, item)
			continue
		}
		if isDataFeedURL(item.SourceURL) {
			key = strings.ToLower(item.Source) + "|" + key
		}
		if _, exists := seen[key]; !exists {
			seen[key] = struct{}{}
			deduped = append(deduped, item)
		}
	}

	// Newest first; zero-time items (no pubDate) sink to the bottom.
	sort.Slice(deduped, func(i, j int) bool {
		ti, tj := deduped[i].Published, deduped[j].Published
		if ti.IsZero() != tj.IsZero() {
			return tj.IsZero()
		}
		return ti.After(tj)
	})

	// RSS/Atom sources alphabetically first, data feed sources alphabetically last.
	sort.Slice(statuses, func(i, j int) bool {
		iData, jData := isDataFeedURL(statuses[i].URL), isDataFeedURL(statuses[j].URL)
		if iData != jData {
			return jData
		}
		return statuses[i].Name < statuses[j].Name
	})

	return Snapshot{Items: deduped, Sources: statuses, UpdatedAt: time.Now().UTC()}
}

// persistSnapshot saves the snapshot to the store, logging but not failing on error.
func (a *Aggregator) persistSnapshot(snap Snapshot) {
	if a.store == nil {
		return
	}
	records := make([]store.SourceRecord, len(snap.Sources))
	for i, s := range snap.Sources {
		records[i] = store.SourceRecord{
			Name:      s.Name,
			URL:       s.URL,
			ItemCount: s.ItemCount,
			LastFetch: s.LastFetch,
			Error:     s.Error,
			OK:        s.OK,
		}
	}
	if err := a.store.SaveSnapshot(snap.Items, records, snap.UpdatedAt); err != nil {
		a.logger.Warn("failed to persist snapshot", "error", err)
	} else {
		a.logger.Info("snapshot persisted to store", "items", len(snap.Items))
	}
}

// Refresh fetches all active feeds unconditionally and replaces the snapshot.
// Used for the manual "Refresh now" action; also resets the per-feed schedule
// so the next scheduled refresh waits the full interval.
func (a *Aggregator) Refresh(ctx context.Context) error {
	feeds := a.activeFeeds()
	items, statuses, err := a.fetchFeeds(ctx, feeds)
	if err != nil {
		return err
	}

	snap := buildSnapshot(items, statuses)
	now := time.Now().UTC()

	a.mu.Lock()
	a.snapshot = snap
	for _, cfg := range feeds {
		a.lastFetch[cfg.Name] = now
	}
	a.mu.Unlock()

	a.persistSnapshot(snap)
	return nil
}

// refreshDue fetches only feeds whose configured refresh interval has elapsed
// since their last fetch, then merges the results into the existing snapshot.
func (a *Aggregator) refreshDue(ctx context.Context, globalInterval time.Duration) error {
	allFeeds := a.activeFeeds()

	a.mu.RLock()
	lastFetchSnap := make(map[string]time.Time, len(a.lastFetch))
	for k, v := range a.lastFetch {
		lastFetchSnap[k] = v
	}
	existing := a.snapshot
	a.mu.RUnlock()

	now := time.Now()
	var due []fetcher.FeedConfig
	for _, cfg := range allFeeds {
		interval := globalInterval
		if cfg.RefreshInterval > 0 {
			interval = cfg.RefreshInterval
		}
		last, seen := lastFetchSnap[cfg.Name]
		if !seen || now.Sub(last) >= interval {
			due = append(due, cfg)
		}
	}

	if len(due) == 0 {
		return nil
	}
	a.logger.Info("scheduled refresh", "due", len(due), "skipped", len(allFeeds)-len(due))

	newItems, newStatuses, err := a.fetchFeeds(ctx, due)
	if err != nil {
		return err
	}

	// Build lookup of refreshed feed names.
	refreshed := make(map[string]bool, len(due))
	for _, cfg := range due {
		refreshed[cfg.Name] = true
	}

	// Carry forward items and statuses from feeds that were not refreshed this cycle.
	merged := make([]fetcher.FeedItem, 0, len(existing.Items)+len(newItems))
	for _, item := range existing.Items {
		if !refreshed[item.Source] {
			merged = append(merged, item)
		}
	}
	merged = append(merged, newItems...)

	mergedStatuses := make([]FeedStatus, 0, len(allFeeds))
	for _, s := range existing.Sources {
		if !refreshed[s.Name] {
			mergedStatuses = append(mergedStatuses, s)
		}
	}
	mergedStatuses = append(mergedStatuses, newStatuses...)

	snap := buildSnapshot(merged, mergedStatuses)

	a.mu.Lock()
	a.snapshot = snap
	for _, cfg := range due {
		a.lastFetch[cfg.Name] = now
	}
	a.mu.Unlock()

	a.persistSnapshot(snap)
	return nil
}

// StartAutoRefresh checks every minute which feeds are due and fetches them.
// globalInterval is the fallback schedule for feeds without a per-feed interval.
// An initial full Refresh runs immediately at startup. Cancel ctx to stop.
func (a *Aggregator) StartAutoRefresh(ctx context.Context, globalInterval time.Duration) {
	a.logger.Info("starting auto-refresh", "globalInterval", globalInterval)

	if err := a.Refresh(ctx); err != nil {
		a.logger.Error("initial refresh failed", "error", err)
	}

	// Tick every minute so short per-feed intervals are honoured promptly.
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := a.refreshDue(ctx, globalInterval); err != nil {
				a.logger.Error("scheduled refresh failed", "error", err)
			}
		case <-ctx.Done():
			a.logger.Info("auto-refresh stopped")
			return
		}
	}
}
