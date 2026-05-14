package store

import (
	"database/sql"
	"fmt"

	"github.com/cyberkryption/cyberfeed/internal/fetcher"
)

// FeedConfigRow is one row from the feed_configs table.
type FeedConfigRow struct {
	Name    string `json:"name"`
	URL     string `json:"url"`
	Enabled bool   `json:"enabled"`
	Parser  string `json:"parser"` // "auto" | "xml" | "csv"
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
	stmt, err := db.Prepare(`INSERT OR IGNORE INTO feed_configs (name, url, enabled, parser) VALUES (?, ?, 1, 'auto')`)
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
	rows, err := db.Query(`SELECT name, url, enabled, parser FROM feed_configs ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("query feed configs: %w", err)
	}
	defer rows.Close()

	var configs []FeedConfigRow
	for rows.Next() {
		var fc FeedConfigRow
		var enabledInt int
		if err := rows.Scan(&fc.Name, &fc.URL, &enabledInt, &fc.Parser); err != nil {
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
	rows, err := db.Query(`SELECT name, url, parser FROM feed_configs WHERE enabled = 1 ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("query enabled feed configs: %w", err)
	}
	defer rows.Close()

	var configs []fetcher.FeedConfig
	for rows.Next() {
		var fc fetcher.FeedConfig
		if err := rows.Scan(&fc.Name, &fc.URL, &fc.Parser); err != nil {
			return nil, fmt.Errorf("scan enabled feed config: %w", err)
		}
		configs = append(configs, fc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate enabled feed configs: %w", err)
	}
	return configs, nil
}

// AddFeedConfig inserts a new feed config. Returns an error if the name already exists.
func AddFeedConfig(db *sql.DB, name, url, parser string) error {
	if parser == "" {
		parser = "auto"
	}
	_, err := db.Exec(`INSERT INTO feed_configs (name, url, enabled, parser) VALUES (?, ?, 1, ?)`, name, url, parser)
	if err != nil {
		return fmt.Errorf("insert feed config: %w", err)
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
