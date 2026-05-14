package store

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/cyberkryption/cyberfeed/internal/fetcher"
)

// FeedConfigRow is one row from the feed_configs table.
type FeedConfigRow struct {
	Name            string `json:"name"`
	URL             string `json:"url"`
	Enabled         bool   `json:"enabled"`
	Parser          string `json:"parser"`          // "auto" | "xml" | "csv" | "json"
	Category        string `json:"category"`        // "auto" | "news" | "threat_intel"
	RefreshInterval int    `json:"refreshInterval"` // minutes; 0 = use global default
}

// CountFeedConfigs returns the number of rows in the feed_configs table.
func CountFeedConfigs(db *sql.DB) (int, error) {
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM feed_configs`).Scan(&n); err != nil {
		return 0, fmt.Errorf("count feed configs: %w", err)
	}
	return n, nil
}

// SeedFeedConfigs inserts the provided feeds using INSERT OR IGNORE so that
// existing rows are not overwritten.
func SeedFeedConfigs(db *sql.DB, feeds []fetcher.FeedConfig) error {
	stmt, err := db.Prepare(`INSERT OR IGNORE INTO feed_configs (name, url, enabled, parser, category, refresh_interval) VALUES (?, ?, 1, 'auto', 'auto', 0)`)
	if err != nil {
		return fmt.Errorf("prepare seed: %w", err)
	}
	defer stmt.Close()

	for _, f := range feeds {
		if _, err := stmt.Exec(f.Name, f.URL); err != nil {
			return fmt.Errorf("seed feed %q: %w", f.Name, err)
		}
	}
	return nil
}

// GetFeedConfigs returns all feed configs ordered by name.
func GetFeedConfigs(db *sql.DB) ([]FeedConfigRow, error) {
	rows, err := db.Query(`SELECT name, url, enabled, parser, category, refresh_interval FROM feed_configs ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("query feed configs: %w", err)
	}
	defer rows.Close()

	var configs []FeedConfigRow
	for rows.Next() {
		var fc FeedConfigRow
		var enabledInt int
		if err := rows.Scan(&fc.Name, &fc.URL, &enabledInt, &fc.Parser, &fc.Category, &fc.RefreshInterval); err != nil {
			return nil, fmt.Errorf("scan feed config: %w", err)
		}
		fc.Enabled = enabledInt == 1
		configs = append(configs, fc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate feed configs: %w", err)
	}
	return configs, nil
}

// GetEnabledFeedConfigs returns only the enabled feed configs as fetcher.FeedConfig values.
func GetEnabledFeedConfigs(db *sql.DB) ([]fetcher.FeedConfig, error) {
	rows, err := db.Query(`SELECT name, url, parser, category, refresh_interval FROM feed_configs WHERE enabled = 1 ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("query enabled feed configs: %w", err)
	}
	defer rows.Close()

	var configs []fetcher.FeedConfig
	for rows.Next() {
		var fc fetcher.FeedConfig
		var mins int
		if err := rows.Scan(&fc.Name, &fc.URL, &fc.Parser, &fc.Category, &mins); err != nil {
			return nil, fmt.Errorf("scan enabled feed config: %w", err)
		}
		if mins > 0 {
			fc.RefreshInterval = time.Duration(mins) * time.Minute
		}
		configs = append(configs, fc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate enabled feed configs: %w", err)
	}
	return configs, nil
}

// AddFeedConfig inserts a new feed config. Returns an error if the name already exists.
func AddFeedConfig(db *sql.DB, name, url, parser, category string, refreshInterval int) error {
	if parser == "" {
		parser = "auto"
	}
	if category == "" {
		category = "auto"
	}
	if refreshInterval < 0 {
		refreshInterval = 0
	}
	_, err := db.Exec(
		`INSERT INTO feed_configs (name, url, enabled, parser, category, refresh_interval) VALUES (?, ?, 1, ?, ?, ?)`,
		name, url, parser, category, refreshInterval,
	)
	if err != nil {
		return fmt.Errorf("insert feed config: %w", err)
	}
	return nil
}

// SetFeedInterval updates the per-feed refresh interval (minutes; 0 = global default).
func SetFeedInterval(db *sql.DB, name string, minutes int) error {
	if minutes < 0 {
		minutes = 0
	}
	_, err := db.Exec(`UPDATE feed_configs SET refresh_interval = ? WHERE name = ?`, minutes, name)
	if err != nil {
		return fmt.Errorf("set feed interval: %w", err)
	}
	return nil
}

// DeleteFeedConfig removes a feed config by name.
func DeleteFeedConfig(db *sql.DB, name string) error {
	_, err := db.Exec(`DELETE FROM feed_configs WHERE name = ?`, name)
	if err != nil {
		return fmt.Errorf("delete feed config: %w", err)
	}
	return nil
}

// SetFeedEnabled updates the enabled state of a feed config.
func SetFeedEnabled(db *sql.DB, name string, enabled bool) error {
	_, err := db.Exec(`UPDATE feed_configs SET enabled = ? WHERE name = ?`, boolToInt(enabled), name)
	if err != nil {
		return fmt.Errorf("set feed enabled: %w", err)
	}
	return nil
}
