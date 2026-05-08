package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"time"

	"cyberfeed/internal/aggregator"
)

// Config holds server configuration.
type Config struct {
	Addr   string
	Logger *slog.Logger
}

// Server wraps the HTTP server and its dependencies.
type Server struct {
	cfg  Config
	agg  *aggregator.Aggregator
	mux  *http.ServeMux
	http *http.Server
}

// New constructs a Server. staticFS is the embedded React build.
func New(cfg Config, agg *aggregator.Aggregator, staticFS fs.FS) (*Server, error) {
	s := &Server{
		cfg: cfg,
		agg: agg,
		mux: http.NewServeMux(),
	}

	// API routes (wrapped with CORS middleware).
	s.mux.Handle("GET /api/feeds", corsMiddleware(http.HandlerFunc(s.handleFeeds)))
	s.mux.Handle("GET /api/health", corsMiddleware(http.HandlerFunc(s.handleHealth)))

	// Serve embedded static files; fall back to index.html for SPA routing.
	s.mux.Handle("/", spaHandler(staticFS))

	s.http = &http.Server{
		Addr:         cfg.Addr,
		Handler:      s.mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return s, nil
}

// ListenAndServe starts the HTTP server. It blocks until the server stops.
func (s *Server) ListenAndServe() error {
	s.cfg.Logger.Info("server listening", "addr", s.cfg.Addr)
	if err := s.http.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("listen and serve: %w", err)
	}
	return nil
}

// Shutdown gracefully drains in-flight requests before stopping.
func (s *Server) Shutdown(ctx context.Context) error {
	s.cfg.Logger.Info("shutting down HTTP server")
	return s.http.Shutdown(ctx)
}

func (s *Server) handleFeeds(w http.ResponseWriter, r *http.Request) {
	snap := s.agg.Snapshot()
	writeJSON(w, http.StatusOK, snap)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

// corsMiddleware adds permissive CORS headers suitable for a local-only tool.
// For a public deployment, restrict Access-Control-Allow-Origin to known origins.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// spaHandler serves static files and falls back to index.html.
func spaHandler(static fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(static))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try to serve the file directly.
		_, err := fs.Stat(static, r.URL.Path[1:])
		if err != nil {
			// Fall back to index.html for client-side routing.
			r2 := r.Clone(r.Context())
			r2.URL.Path = "/"
			fileServer.ServeHTTP(w, r2)
			return
		}
		fileServer.ServeHTTP(w, r)
	})
}
