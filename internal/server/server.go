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
	"sync"
	"time"

	"github.com/cyberkryption/cyberfeed/internal/aggregator"
	"github.com/cyberkryption/cyberfeed/internal/audit"
	"github.com/cyberkryption/cyberfeed/internal/auth"
	"github.com/cyberkryption/cyberfeed/internal/fetcher"
	"github.com/cyberkryption/cyberfeed/internal/store"
)

type contextKey string

const usernameCtxKey contextKey = "username"

// Config holds server configuration.
type Config struct {
	Addr     string
	Logger   *slog.Logger
	DB       *sql.DB       // required — used for session validation
	AuditLog *audit.Logger // optional — nil disables audit logging
}

// maxRequestBodyBytes caps the size of any API request body to prevent
// memory exhaustion from oversized payloads.
const maxRequestBodyBytes = 1 << 20 // 1 MiB

// minRefreshInterval is the minimum gap between manual feed refreshes.
const minRefreshInterval = 30 * time.Second

// Server wraps the HTTP server and its dependencies.
type Server struct {
	cfg              Config
	agg              *aggregator.Aggregator
	db               *sql.DB
	limiter          *auth.LoginLimiter
	mux              *http.ServeMux
	http             *http.Server
	refreshMu        sync.Mutex
	lastManualRefresh time.Time
}

// New constructs a Server. staticFS is the embedded React build.
func New(cfg Config, agg *aggregator.Aggregator, staticFS fs.FS) (*Server, error) {
	if cfg.DB == nil {
		return nil, fmt.Errorf("server.Config.DB must not be nil")
	}
	s := &Server{
		cfg:     cfg,
		agg:     agg,
		db:      cfg.DB,
		limiter: auth.NewLoginLimiter(),
		mux:     http.NewServeMux(),
	}

	// Auth endpoints — all three are unprotected at the transport level.
	// login/logout manage their own cookie; me returns 200 with authenticated:false
	// when no session exists so browsers never log a 401 on the initial auth check.
	s.mux.Handle("POST /api/auth/login", apiMiddleware(http.HandlerFunc(s.handleLogin)))
	s.mux.Handle("POST /api/auth/logout", apiMiddleware(http.HandlerFunc(s.handleLogout)))
	s.mux.Handle("GET /api/auth/me", apiMiddleware(http.HandlerFunc(s.handleMe)))
	s.mux.Handle("POST /api/auth/change-password", apiMiddleware(s.requireSession(http.HandlerFunc(s.handleChangePassword))))

	// Data endpoints — all require a valid session.
	s.mux.Handle("GET /api/feeds", apiMiddleware(s.requireSession(http.HandlerFunc(s.handleFeeds))))
	s.mux.Handle("GET /api/health", apiMiddleware(s.requireSession(http.HandlerFunc(s.handleHealth))))

	// Feed admin endpoints — all require a valid session.
	s.mux.Handle("GET /api/admin/feeds", apiMiddleware(s.requireSession(http.HandlerFunc(s.handleAdminListFeeds))))
	s.mux.Handle("POST /api/admin/feeds", apiMiddleware(s.requireSession(http.HandlerFunc(s.handleAdminAddFeed))))
	s.mux.Handle("DELETE /api/admin/feeds/{name}", apiMiddleware(s.requireSession(http.HandlerFunc(s.handleAdminDeleteFeed))))
	s.mux.Handle("PATCH /api/admin/feeds/{name}", apiMiddleware(s.requireSession(http.HandlerFunc(s.handleAdminSetFeedEnabled))))
	s.mux.Handle("POST /api/admin/refresh", apiMiddleware(s.requireSession(http.HandlerFunc(s.handleAdminRefresh))))

	// SPA static assets — served without auth so the login form can load.
	s.mux.Handle("/", spaHandler(staticFS))

	s.http = &http.Server{
		Addr:         cfg.Addr,
		Handler:      securityHeaders(s.mux),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 60 * time.Second, // manual refresh can take ~15-20 s with all feeds in parallel
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

// StartLimiterPruner removes stale rate-limit entries every 10 minutes.
// It exits when ctx is cancelled (i.e. on server shutdown).
func (s *Server) StartLimiterPruner(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.limiter.PruneStale()
		case <-ctx.Done():
			return
		}
	}
}

// Shutdown gracefully drains in-flight requests before stopping.
func (s *Server) Shutdown(ctx context.Context) error {
	s.cfg.Logger.Info("shutting down HTTP server")
	return s.http.Shutdown(ctx)
}

// audit writes a security event to the audit log. It is a no-op when no
// AuditLog is configured. ip is always included; additional fields are passed
// as a flat map and merged at the top level of the NDJSON record.
func (s *Server) audit(event string, fields map[string]any) {
	s.cfg.AuditLog.Log(event, fields)
}

// ── Auth handlers ────────────────────────────────────────────────────────────

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	ip := auth.ClientIP(r)

	if ok, retryAfter := s.limiter.Allow(ip); !ok {
		secs := int(retryAfter.Seconds()) + 1
		s.audit(audit.EventLoginRateLimited, map[string]any{"ip": ip})
		w.Header().Set("Retry-After", fmt.Sprintf("%d", secs))
		writeJSON(w, http.StatusTooManyRequests, map[string]string{
			"error": fmt.Sprintf("too many failed login attempts — try again in %d seconds", secs),
		})
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	token, err := auth.Login(s.db, req.Username, req.Password)
	if err != nil {
		s.limiter.RecordFailure(ip)
		s.cfg.Logger.Warn("failed login attempt", "ip", ip)
		s.audit(audit.EventLoginFailure, map[string]any{"ip": ip, "username_attempted": req.Username})
		// Always return the same message — prevents user enumeration.
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
		return
	}

	s.limiter.RecordSuccess(ip)
	s.audit(audit.EventLoginSuccess, map[string]any{"ip": ip, "username": req.Username})
	secure := r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int(24 * time.Hour / time.Second),
	})
	writeJSON(w, http.StatusOK, map[string]string{"username": req.Username})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	ip := auth.ClientIP(r)
	var username string
	if cookie, err := r.Cookie(auth.CookieName); err == nil {
		// Resolve username before the session is deleted.
		username, _ = auth.ValidateSession(s.db, cookie.Value)
		_ = auth.Logout(s.db, cookie.Value)
	}
	s.audit(audit.EventLogout, map[string]any{"ip": ip, "username": username})
	secure := r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
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

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	username, _ := r.Context().Value(usernameCtxKey).(string)

	var req struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.CurrentPassword == "" || req.NewPassword == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "currentPassword and newPassword are required"})
		return
	}
	if len(req.NewPassword) < 8 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "new password must be at least 8 characters"})
		return
	}

	ip := auth.ClientIP(r)
	if err := auth.VerifyPassword(s.db, username, req.CurrentPassword); err != nil {
		s.audit(audit.EventPasswordChangeFail, map[string]any{"ip": ip, "username": username})
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "current password is incorrect"})
		return
	}

	if err := auth.UpdatePassword(s.db, username, req.NewPassword); err != nil {
		s.cfg.Logger.Error("change password", "username", username, "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	s.audit(audit.EventPasswordChanged, map[string]any{"ip": ip, "username": username})
	// Clear the session cookie — the session was just deleted server-side.
	secure := r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		MaxAge:   -1,
	})
	s.cfg.Logger.Info("password changed — all sessions invalidated", "username", username)
	writeJSON(w, http.StatusOK, map[string]string{"status": "password changed"})
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
		s.cfg.Logger.Error("list feeds", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	// Return empty array instead of null when no feeds exist.
	if feeds == nil {
		feeds = []store.FeedConfigRow{}
	}
	writeJSON(w, http.StatusOK, feeds)
}

func (s *Server) handleAdminAddFeed(w http.ResponseWriter, r *http.Request) {
	ip := auth.ClientIP(r)
	username, _ := r.Context().Value(usernameCtxKey).(string)

	var req struct {
		Name            string `json:"name"`
		URL             string `json:"url"`
		Parser          string `json:"parser"`          // "auto" | "xml" | "csv" | "json"
		Category        string `json:"category"`        // "auto" | "news" | "threat_intel"
		RefreshInterval int    `json:"refreshInterval"` // minutes; 0 = global default
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
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
	if err := fetcher.ValidateFeedURL(req.URL); err != nil {
		s.audit(audit.EventSSRFBlocked, map[string]any{
			"ip": ip, "username": username,
			"feed_name": req.Name, "feed_url": req.URL, "reason": err.Error(),
		})
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid feed URL: " + err.Error()})
		return
	}
	if req.Parser != "" && req.Parser != "auto" && req.Parser != "xml" && req.Parser != "csv" && req.Parser != "json" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "parser must be auto, xml, csv, or json"})
		return
	}
	if req.Category != "" && req.Category != "auto" && req.Category != "news" && req.Category != "threat_intel" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "category must be auto, news, or threat_intel"})
		return
	}
	if req.RefreshInterval < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "refreshInterval must be >= 0"})
		return
	}
	if err := store.AddFeedConfig(s.db, req.Name, req.URL, req.Parser, req.Category, req.RefreshInterval); err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint") {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "a feed with that name already exists"})
			return
		}
		s.cfg.Logger.Error("add feed config", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	s.audit(audit.EventFeedAdded, map[string]any{
		"ip": ip, "username": username,
		"feed_name": req.Name, "feed_url": req.URL, "parser": req.Parser, "category": req.Category,
	})
	writeJSON(w, http.StatusCreated, map[string]string{"status": "created"})
}

func (s *Server) handleAdminDeleteFeed(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}
	if err := store.DeleteFeedConfig(s.db, name); err != nil {
		s.cfg.Logger.Error("delete feed config", "name", name, "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	username, _ := r.Context().Value(usernameCtxKey).(string)
	s.audit(audit.EventFeedDeleted, map[string]any{
		"ip": auth.ClientIP(r), "username": username, "feed_name": name,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleAdminSetFeedEnabled(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}
	var req struct {
		Enabled         *bool `json:"enabled"`
		RefreshInterval *int  `json:"refreshInterval"` // minutes; 0 = global default
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.Enabled == nil && req.RefreshInterval == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "enabled or refreshInterval is required"})
		return
	}
	if req.Enabled != nil {
		if err := store.SetFeedEnabled(s.db, name, *req.Enabled); err != nil {
			s.cfg.Logger.Error("set feed enabled", "name", name, "error", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
			return
		}
		username, _ := r.Context().Value(usernameCtxKey).(string)
		s.audit(audit.EventFeedToggled, map[string]any{
			"ip": auth.ClientIP(r), "username": username,
			"feed_name": name, "enabled": *req.Enabled,
		})
	}
	if req.RefreshInterval != nil {
		if *req.RefreshInterval < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "refreshInterval must be >= 0"})
			return
		}
		if err := store.SetFeedInterval(s.db, name, *req.RefreshInterval); err != nil {
			s.cfg.Logger.Error("set feed interval", "name", name, "error", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// handleAdminRefresh triggers an immediate server-side feed refresh and returns
// the updated snapshot. The HTTP write timeout (30 s) is sufficient since feeds
// are fetched in parallel and the slowest CSV timeout is 45 s only for very
// large files — in practice the full refresh completes in ~2–5 s.
func (s *Server) handleAdminRefresh(w http.ResponseWriter, r *http.Request) {
	s.refreshMu.Lock()
	since := time.Since(s.lastManualRefresh)
	if since < minRefreshInterval {
		s.refreshMu.Unlock()
		retryAfter := int((minRefreshInterval - since).Seconds()) + 1
		w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
		writeJSON(w, http.StatusTooManyRequests, map[string]string{
			"error": fmt.Sprintf("manual refresh is rate-limited — try again in %d seconds", retryAfter),
		})
		return
	}
	s.lastManualRefresh = time.Now()
	s.refreshMu.Unlock()

	if err := s.agg.Refresh(r.Context()); err != nil {
		s.cfg.Logger.Error("manual refresh", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "refresh failed"})
		return
	}
	writeJSON(w, http.StatusOK, s.agg.Snapshot())
}

// ── Middleware ────────────────────────────────────────────────────────────────

// requireSession validates the session cookie and stores the username in the
// request context. Returns 401 if the cookie is missing or invalid.
func (s *Server) requireSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := auth.ClientIP(r)
		cookie, err := r.Cookie(auth.CookieName)
		if err != nil {
			s.audit(audit.EventSessionRejected, map[string]any{
				"ip": ip, "reason": "no_cookie", "path": r.URL.Path,
			})
			s.unauthorized(w)
			return
		}
		username, err := auth.ValidateSession(s.db, cookie.Value)
		if err != nil {
			s.audit(audit.EventSessionRejected, map[string]any{
				"ip": ip, "reason": "invalid_token", "path": r.URL.Path,
			})
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

// securityHeaders adds standard HTTP security headers to every response.
// It wraps the top-level mux so both API and SPA routes are covered.
// HSTS is only sent when the connection is TLS (direct or via a trusted proxy).
func securityHeaders(next http.Handler) http.Handler {
	// Content-Security-Policy notes:
	//   • script-src 'self'          — all JS is bundled and served from the same origin
	//   • style-src 'self' 'unsafe-inline' — Mantine injects small inline style blocks
	//   • img-src 'self' data:       — favicon + any base64-encoded images
	//   • font-src 'self'            — fonts are bundled into the dist assets
	//   • connect-src 'self'         — all XHR/fetch goes to the same origin API
	//   • frame-ancestors 'none'     — disallows embedding in iframes (clickjacking)
	const csp = "default-src 'self'; " +
		"script-src 'self'; " +
		"style-src 'self' 'unsafe-inline'; " +
		"img-src 'self' data:; " +
		"font-src 'self'; " +
		"connect-src 'self'; " +
		"frame-ancestors 'none'"

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", csp)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		// HSTS: only meaningful over TLS. Honour X-Forwarded-Proto for deployments
		// behind a TLS-terminating reverse proxy (nginx, Caddy, etc.).
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

// apiMiddleware sets JSON content-type, cache-control, and same-origin CORS headers.
// The SPA and API are co-hosted so cross-origin requests are not expected;
// the Origin is echoed back only when it matches the request Host, which
// preserves preflight support for local dev proxies without opening a wildcard.
func apiMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Prevent API responses (including auth/session data) from being stored
		// in browser caches or intermediate proxies.
		w.Header().Set("Cache-Control", "no-store")

		if origin := r.Header.Get("Origin"); origin != "" {
			// Allow the origin only when it is the same host as the server.
			// r.Host is the value of the Host header (or the server address).
			if strings.HasSuffix(origin, r.Host) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, PATCH, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Vary", "Origin")
			}
		}
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
