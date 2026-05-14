// Package logrotate provides a daily-rotating io.WriteCloser that writes log
// files to a directory, keeping at most maxDays days of files.
package logrotate

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const fileLayout = "2006-01-02"

// Writer is an io.WriteCloser that rotates to a new file at midnight and
// deletes files older than MaxDays days.
type Writer struct {
	dir     string
	prefix  string
	maxDays int

	mu      sync.Mutex
	current *os.File
	day     string // date string of the current file (fileLayout)
}

// New opens (or creates) the log directory, purges old files, and returns a
// Writer ready to use. prefix is the base name; files are named
// "<prefix>-YYYY-MM-DD.log".
func New(dir, prefix string, maxDays int) (*Writer, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("logrotate: create dir %s: %w", dir, err)
	}
	w := &Writer{dir: dir, prefix: prefix, maxDays: maxDays}
	if err := w.purgeOld(); err != nil {
		return nil, err
	}
	if err := w.openDay(time.Now()); err != nil {
		return nil, err
	}
	return w, nil
}

// Write implements io.Writer. It rotates to a new file if the calendar day
// has changed since the last write.
func (w *Writer) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	now := time.Now()
	if now.Format(fileLayout) != w.day {
		if err := w.rotate(now); err != nil {
			return 0, err
		}
	}
	return w.current.Write(p)
}

// Close closes the current log file.
func (w *Writer) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.current != nil {
		return w.current.Close()
	}
	return nil
}

func (w *Writer) openDay(t time.Time) error {
	day := t.Format(fileLayout)
	name := filepath.Join(w.dir, fmt.Sprintf("%s-%s.log", w.prefix, day))
	f, err := os.OpenFile(name, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return fmt.Errorf("logrotate: open %s: %w", name, err)
	}
	w.current = f
	w.day = day
	return nil
}

func (w *Writer) rotate(t time.Time) error {
	if w.current != nil {
		_ = w.current.Close()
	}
	if err := w.purgeOld(); err != nil {
		return err
	}
	return w.openDay(t)
}

func (w *Writer) purgeOld() error {
	cutoff := time.Now().AddDate(0, 0, -w.maxDays)
	entries, err := os.ReadDir(w.dir)
	if err != nil {
		return fmt.Errorf("logrotate: read dir %s: %w", w.dir, err)
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasPrefix(name, w.prefix+"-") || !strings.HasSuffix(name, ".log") {
			continue
		}
		// Extract the date portion between prefix- and .log
		dateStr := strings.TrimSuffix(strings.TrimPrefix(name, w.prefix+"-"), ".log")
		t, err := time.Parse(fileLayout, dateStr)
		if err != nil {
			continue
		}
		if t.Before(cutoff) {
			_ = os.Remove(filepath.Join(w.dir, name))
		}
	}
	return nil
}
