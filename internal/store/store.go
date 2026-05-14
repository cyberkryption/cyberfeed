package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "modernc.org/sqlite"

	"github.com/cyberkryption/cyberfeed/internal/fetcher"
)

// SourceRecord mirrors aggregator.FeedStatus for storage purposes.
type SourceRecord struct {
	Name      string
	URL       string
	ItemCount int
	LastFetch time.Time
	Error     string
	OK        bool
}

const schema = `
CREATE TABLE IF NOT EXISTS feed_items (
    source      TEXT NOT NULL,
    source_url  TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    link        TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    published   TEXT NOT NULL DEFAULT '',
    author      TEXT NOT NULL DEFAULT '',
    categories  TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS feed_sources (
    name        TEXT NOT NULL,
    url         TEXT NOT NULL,
    item_count  INTEGER NOT NULL DEFAULT 0,
    last_fetch  TEXT NOT NULL DEFAULT '',
    error       TEXT NOT NULL DEFAULT '',
    ok          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS feed_configs (
    name    TEXT PRIMARY KEY,
    url     TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
);

PRAGMA journal_mode=WAL;
`

// Store persists feed snapshots to a SQLite database.
type Store struct {
	db *sql.DB
}

// Open opens (or creates) the SQLite database at path and initialises the schema.
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1) // SQLite is single-writer
	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("init schema: %w", err)
	}
	// Add parser column to feed_configs if it was created before this column existed.
	// ALTER TABLE ADD COLUMN is idempotent-ish: we ignore the error if it already exists.
	_, _ = db.Exec(`ALTER TABLE feed_configs ADD COLUMN parser TEXT NOT NULL DEFAULT 'auto'`)
	return &Store{db: db}, nil
}

// DB returns the underlying *sql.DB so other packages (e.g. auth) can share
// the same SQLite connection without opening a second file handle.
func (s *Store) DB() *sql.DB {
	return s.db
}

// Close closes the underlying database connection.
func (s *Store) Close() error {
	return s.db.Close()
}

// SaveSnapshot atomically replaces the stored snapshot with the provided data.
func (s *Store) SaveSnapshot(items []fetcher.FeedItem, sources []SourceRecord, updatedAt time.Time) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.Exec(`DELETE FROM feed_items`); err != nil {
		return fmt.Errorf("clear items: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM feed_sources`); err != nil {
		return fmt.Errorf("clear sources: %w", err)
	}

	itemStmt, err := tx.Prepare(`
		INSERT INTO feed_items (source, source_url, title, link, description, published, author, categories)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("prepare item insert: %w", err)
	}
	defer itemStmt.Close()

	for _, item := range items {
		cats, _ := json.Marshal(item.Categories)
		var pub string
		if !item.Published.IsZero() {
			pub = item.Published.UTC().Format(time.RFC3339)
		}
		if _, err := itemStmt.Exec(
			item.Source, item.SourceURL, item.Title, item.Link,
			item.Description, pub, item.Author, string(cats),
		); err != nil {
			return fmt.Errorf("insert item: %w", err)
		}
	}

	srcStmt, err := tx.Prepare(`
		INSERT INTO feed_sources (name, url, item_count, last_fetch, error, ok)
		VALUES (?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("prepare source insert: %w", err)
	}
	defer srcStmt.Close()

	for _, src := range sources {
		if _, err := srcStmt.Exec(
			src.Name, src.URL, src.ItemCount,
			src.LastFetch.UTC().Format(time.RFC3339),
			src.Error, boolToInt(src.OK),
		); err != nil {
			return fmt.Errorf("insert source: %w", err)
		}
	}

	if _, err := tx.Exec(
		`INSERT INTO meta (key, value) VALUES ('updated_at', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
		updatedAt.UTC().Format(time.RFC3339),
	); err != nil {
		return fmt.Errorf("update meta: %w", err)
	}

	return tx.Commit()
}

// LoadSnapshot reads the last persisted snapshot. Returns empty results if no data has been saved yet.
func (s *Store) LoadSnapshot() ([]fetcher.FeedItem, []SourceRecord, time.Time, error) {
	var updatedAt time.Time
	row := s.db.QueryRow(`SELECT value FROM meta WHERE key = 'updated_at'`)
	var updStr string
	if err := row.Scan(&updStr); err == nil {
		updatedAt, _ = time.Parse(time.RFC3339, updStr)
	}
	if updatedAt.IsZero() {
		return nil, nil, time.Time{}, nil
	}

	rows, err := s.db.Query(`SELECT source, source_url, title, link, description, published, author, categories FROM feed_items`)
	if err != nil {
		return nil, nil, time.Time{}, fmt.Errorf("query items: %w", err)
	}
	defer rows.Close()

	var items []fetcher.FeedItem
	for rows.Next() {
		var item fetcher.FeedItem
		var pub, catsJSON string
		if err := rows.Scan(
			&item.Source, &item.SourceURL, &item.Title, &item.Link,
			&item.Description, &pub, &item.Author, &catsJSON,
		); err != nil {
			return nil, nil, time.Time{}, fmt.Errorf("scan item: %w", err)
		}
		if pub != "" {
			item.Published, _ = time.Parse(time.RFC3339, pub)
		}
		_ = json.Unmarshal([]byte(catsJSON), &item.Categories)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, time.Time{}, fmt.Errorf("iterate items: %w", err)
	}

	srows, err := s.db.Query(`SELECT name, url, item_count, last_fetch, error, ok FROM feed_sources`)
	if err != nil {
		return nil, nil, time.Time{}, fmt.Errorf("query sources: %w", err)
	}
	defer srows.Close()

	var sources []SourceRecord
	for srows.Next() {
		var src SourceRecord
		var lastFetch string
		var okInt int
		if err := srows.Scan(&src.Name, &src.URL, &src.ItemCount, &lastFetch, &src.Error, &okInt); err != nil {
			return nil, nil, time.Time{}, fmt.Errorf("scan source: %w", err)
		}
		src.LastFetch, _ = time.Parse(time.RFC3339, lastFetch)
		src.OK = okInt == 1
		sources = append(sources, src)
	}
	if err := srows.Err(); err != nil {
		return nil, nil, time.Time{}, fmt.Errorf("iterate sources: %w", err)
	}

	return items, sources, updatedAt, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
