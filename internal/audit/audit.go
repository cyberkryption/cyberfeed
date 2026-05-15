// Package audit writes security events to a newline-delimited JSON (NDJSON)
// file. Each line is a self-contained JSON object with at minimum a
// "timestamp" (RFC 3339 UTC) and "event" field, plus any caller-supplied
// fields merged in at the top level.
//
// All methods are safe for concurrent use.
package audit

import (
	"encoding/json"
	"os"
	"sync"
	"time"
)

// Event names written by the server.
const (
	EventLoginSuccess      = "login_success"
	EventLoginFailure      = "login_failure"
	EventLoginRateLimited  = "login_rate_limited"
	EventLogout            = "logout"
	EventSessionRejected   = "session_rejected"
	EventPasswordChanged   = "password_changed"
	EventPasswordChangeFail = "password_change_failed"
	EventFeedAdded         = "feed_added"
	EventFeedDeleted       = "feed_deleted"
	EventFeedToggled       = "feed_toggled"
	EventSSRFBlocked       = "ssrf_blocked"
)

// Logger appends NDJSON security events to a file.
type Logger struct {
	mu   sync.Mutex
	file *os.File
}

// New opens (or creates) the NDJSON audit log at path in append mode.
// The file is created with mode 0600 so only the process owner can read it.
func New(path string) (*Logger, error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, err
	}
	return &Logger{file: f}, nil
}

// Close flushes and closes the underlying file. Safe to call on nil.
func (l *Logger) Close() error {
	if l == nil {
		return nil
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.file.Close()
}

// Log writes one NDJSON record. The mandatory "timestamp" and "event" fields
// are added automatically; all entries in fields are merged at the top level.
// A nil Logger is a no-op so callers never need to guard with != nil.
func (l *Logger) Log(event string, fields map[string]any) {
	if l == nil {
		return
	}

	rec := make(map[string]any, len(fields)+2)
	for k, v := range fields {
		rec[k] = v
	}
	rec["timestamp"] = time.Now().UTC().Format(time.RFC3339)
	rec["event"] = event

	data, err := json.Marshal(rec)
	if err != nil {
		return
	}
	data = append(data, '\n')

	l.mu.Lock()
	defer l.mu.Unlock()
	_, _ = l.file.Write(data)
}
