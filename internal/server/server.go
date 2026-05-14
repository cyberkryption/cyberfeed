package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/cyberkryption/cyberfeed/internal/aggregator"
	"github.com/cyberkryption/cyberfeed/internal/auth"
	"github.com/cyberkryption/cyberfeed/internal/store"
)

type contextKey string

const usernameCtxKey contextKey = "username"

// Config holds server configuration.
type Config struct {
	Addr   string
	Logger *slog.Logger
	DB     *sql.DB // required — used for session validation
}

// Server wraps the HTTP server and its dependencies.
type Server struct {
	cfg  Config
	agg  *aggregator.Aggregator
	db   *sql.DB
	mux  *http.ServeMux
	http *http.Server
}

// New constructs a Server. staticFS is the embedded React build.
func New(cfg Config, agg *aggregator.Aggregator, staticFS fs.FS) (*Server, error) {
	if cfg.DB == nil {
		return nil, fmt.Errorf("server.Config.DB must not be nil")
	}
	s := &Server{
		cfg: cfg,
		agg: agg,
		db:  cfg.DB,
		mux: http.NewServeMux(),
	}

	// Auth endpoints — all three are unprotected at the transport level.
	// login/logout manage their own cookie; me returns 200 with authenticated:false
	// when no session exists so browsers never log a 401 on the initial auth check.
	s.mux.Handle("POST /api/auth/login", apiMiddleware(http.HandlerFunc(s.handleLogin)))
	s.mux.Handle("POST /api/auth/logout", apiMiddleware(http.HandlerFunc(s.handleLogout)))
	s.mux.Handle("GET /api/auth/me", apiMiddleware(http.HandlerFunc(s.handleMe)))

	// Data endpoints — all require a valid session.
	s.mux.Handle("GET /api/feeds", apiMiddleware(s.requireSession(http.HandlerFunc(s.handleFeeds))))
	s.mux.Handle("GET /api/health", apiMiddleware(s.requireSession(http.HandlerFunc(s.handleHealth))))

	// Feed admin endpoints — all require a valid session.
	s.mux.Handle("GET /api/admin/feeds", apiMiddleware(s.requireSession(http.HandlerFunc(s.handleAdminListFeeds))))
	s.mux.Handle("POST /api/admin/feeds", apiMiddleware(s.requireSession(http.HandlerFunc(s.handleAdminAddFeed))))
	s.mux.Handle("DELETE /api/admin/feeds/{name}", apiMiddleware(s.requireSession(http.HandlerFunc(s.handleAdminDeleteFeed))))
	s.mux.Handle("PATCH /api/admin/feeds/{name}", apiMiddleware(s.requireSession(http.HandlerFunc(s.handleAdminSetFeedEnabled))))

	// SPA static assets — served without auth so the login form can load.
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

// ── Auth handlers ────────────────────────────────────────────────────────────

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	token, err := auth.Login(s.db, req.Username, req.Password)
	if err != nil {
		// Always return the same message — prevents user enumeration.
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int(24 * time.Hour / time.Second),
	})
	writeJSON(w, http.StatusOK, map[string]string{"username": req.Username})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(auth.CookieName); err == nil {
		_ = auth.Logout(s.db, cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "logged out"})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	type meResponse struct {
		Authenticated bool   `json:"authenticated"`
		Username      string `json:"username,omitempty"`
	}
	cookie, err := r.Cookie(auth.CookieName)
	if err != nil {
		writeJSON(w, http.StatusOK, meResponse{})
		return
	}
	username, err := auth.ValidateSession(s.db, cookie.Value)
	if err != nil {
		// Clear the stale cookie quietly — no 401 logged in the browser.
		http.SetCookie(w, &http.Cookie{
			Name:     auth.CookieName,
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			MaxAge:   -1,
		})
		writeJSON(w, http.StatusOK, meResponse{})
		return
	}
	writeJSON(w, http.StatusOK, meResponse{Authenticated: true, Username: username})
}

// ── Feed handlers ─────────────────────────────────────────────────────────────

func (s *Server) handleFeeds(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.agg.Snapshot())
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ── Feed admin handlers ───────────────────────────────────────────────────────

func (s *Server) handleAdminListFeeds(w http.ResponseWriter, r *http.Request) {
	feeds, err := store.GetFeedConfigs(s.db)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	// Return empty array instead of null when no feeds exist.
	if feeds == nil {
		feeds = []store.FeedConfigRow{}
	}
	writeJSON(w, http.StatusOK, feeds)
}

func (s *Server) handleAdminAddFeed(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
		URL  string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.Name == "" || req.URL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name and url are required"})
		return
	}
	if !strings.HasPrefix(req.URL, "http://") && !strings.HasPrefix(req.URL, "https://") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "url must start with http:// or https://"})
		return
	}
	if err := store.AddFeedConfig(s.db, req.Name, req.URL); err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint") {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "a feed with that name already exists"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"status": "created"})
}

func (s *Server) handleAdminDeleteFeed(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}
	if err := store.DeleteFeedConfig(s.db, name); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleAdminSetFeedEnabled(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if err := store.SetFeedEnabled(s.db, name, req.Enabled); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// ── Middleware ────────────────────────────────────────────────────────────────

// requireSession validates the session cookie and stores the username in the
// request context. Returns 401 if the cookie is missing or invalid.
func (s *Server) requireSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(auth.CookieName)
		if err != nil {
			s.unauthorized(w)
			return
		}
		username, err := auth.ValidateSession(s.db, cookie.Value)
		if err != nil {
			// Clear the stale cookie.
			http.SetCookie(w, &http.Cookie{
				Name:     auth.CookieName,
				Value:    "",
				Path:     "/",
				HttpOnly: true,
				MaxAge:   -1,
			})
			s.unauthorized(w)
			return
		}
		ctx := context.WithValue(r.Context(), usernameCtxKey, username)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) unauthorized(w http.ResponseWriter) {
	writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
}

// apiMiddleware sets JSON content-type and permissive CORS headers.
func apiMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, PATCH, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

// spaHandler serves embedded static assets and falls back to index.html for
// any path that doesn't match a real file (client-side SPA routing).
// Uses http.ServeFileFS so the root "/" never triggers a FileServer redirect.
func spaHandler(static fs.FS) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Resolve the requested path to a clean relative fs path.
		name := path.Clean(strings.TrimPrefix(r.URL.Path, "/"))
		if name == "." || name == "/" {
			name = "index.html"
		}
		if _, err := fs.Stat(static, name); err != nil {
			// Unknown path → let the React router handle it client-side.
			name = "index.html"
		}
		http.ServeFileFS(w, r, static, name)
	})
}
