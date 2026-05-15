package main

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cyberkryption/cyberfeed/internal/aggregator"
	"github.com/cyberkryption/cyberfeed/internal/audit"
	"github.com/cyberkryption/cyberfeed/internal/auth"
	"github.com/cyberkryption/cyberfeed/internal/fetcher"
	"github.com/cyberkryption/cyberfeed/internal/logrotate"
	"github.com/cyberkryption/cyberfeed/internal/server"
	"github.com/cyberkryption/cyberfeed/internal/store"
)

//go:embed web/dist
var embeddedWeb embed.FS

func main() {
	// Set up daily-rotating log files in ./logs, keeping 7 days.
	logDir := os.Getenv("CYBERFEED_LOG_DIR")
	if logDir == "" {
		logDir = "logs"
	}
	logWriter, err := logrotate.New(logDir, "cyberfeed", 7)
	if err != nil {
		// Non-fatal: fall back to stdout-only logging and warn.
		fmt.Fprintf(os.Stderr, "warn: could not open log directory %q: %v — logging to stdout only\n", logDir, err)
	}

	var logDest io.Writer = os.Stdout
	if logWriter != nil {
		logDest = io.MultiWriter(os.Stdout, logWriter)
		defer logWriter.Close()
	}

	logger := slog.New(slog.NewTextHandler(logDest, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	if logWriter != nil {
		logger.Info("logging to file", "dir", logDir)
	}

	staticFS, err := fs.Sub(embeddedWeb, "web/dist")
	if err != nil {
		logger.Error("sub embedded fs", "error", err)
		os.Exit(1)
	}

	feeds, err := fetcher.LoadFeedsFile("feeds.txt")
	if err != nil {
		logger.Warn("could not load feeds.txt, using built-in defaults", "error", err)
		feeds = fetcher.DefaultFeeds
	} else {
		logger.Info("loaded feeds from feeds.txt", "count", len(feeds))
	}

	// SQLite store is required — both feed persistence and auth use it.
	dbPath := os.Getenv("CYBERFEED_DB")
	if dbPath == "" {
		dbPath = "cyberfeed.db"
	}
	st, err := store.Open(dbPath)
	if err != nil {
		logger.Error("could not open store — cannot start without a database", "path", dbPath, "error", err)
		os.Exit(1)
	}
	defer st.Close()
	logger.Info("store opened", "path", dbPath)

	db := st.DB()

	// Initialise auth schema and ensure at least one user exists.
	if err := auth.InitSchema(db); err != nil {
		logger.Error("init auth schema", "error", err)
		os.Exit(1)
	}

	// Seed feed_configs from feeds.txt on first run (or if table is empty).
	feedCount, err := store.CountFeedConfigs(db)
	if err != nil {
		logger.Error("count feed configs", "error", err)
		os.Exit(1)
	}
	if feedCount == 0 {
		if err := store.SeedFeedConfigs(db, feeds); err != nil {
			logger.Error("seed feed configs", "error", err)
			os.Exit(1)
		}
		logger.Info("seeded feed configs", "count", len(feeds))
	}

	count, err := auth.UserCount(db)
	if err != nil {
		logger.Error("check user count", "error", err)
		os.Exit(1)
	}

	adminUser := os.Getenv("CYBERFEED_ADMIN_USERNAME")
	if adminUser == "" {
		adminUser = "admin"
	}
	adminPass := os.Getenv("CYBERFEED_ADMIN_PASSWORD")

	if count == 0 {
		// First run: password is required.
		if adminPass == "" {
			fmt.Fprintln(os.Stderr, "")
			fmt.Fprintln(os.Stderr, "╔══════════════════════════════════════════════════════════╗")
			fmt.Fprintln(os.Stderr, "║  FIRST-RUN SETUP REQUIRED                                ║")
			fmt.Fprintln(os.Stderr, "║                                                          ║")
			fmt.Fprintln(os.Stderr, "║  No user accounts exist. Set the admin password before   ║")
			fmt.Fprintln(os.Stderr, "║  starting cyberfeed:                                     ║")
			fmt.Fprintln(os.Stderr, "║                                                          ║")
			fmt.Fprintln(os.Stderr, "║  Linux / macOS:                                          ║")
			fmt.Fprintln(os.Stderr, "║    CYBERFEED_ADMIN_PASSWORD=yourpassword ./cyberfeed      ║")
			fmt.Fprintln(os.Stderr, "║                                                          ║")
			fmt.Fprintln(os.Stderr, "║  Windows PowerShell:                                     ║")
			fmt.Fprintln(os.Stderr, "║    $env:CYBERFEED_ADMIN_PASSWORD=\"yourpassword\"           ║")
			fmt.Fprintln(os.Stderr, "║    .\\cyberfeed.exe                                        ║")
			fmt.Fprintln(os.Stderr, "║                                                          ║")
			fmt.Fprintln(os.Stderr, "║  Optional: set CYBERFEED_ADMIN_USERNAME (default: admin) ║")
			fmt.Fprintln(os.Stderr, "╚══════════════════════════════════════════════════════════╝")
			fmt.Fprintln(os.Stderr, "")
			os.Exit(1)
		}
		if err := auth.CreateUser(db, adminUser, adminPass); err != nil {
			logger.Error("create admin user", "error", err)
			os.Exit(1)
		}
		logger.Info("created admin user", "username", adminUser)
	} else if adminPass != "" {
		// Users exist and env var is set: update the named user's password so
		// setting CYBERFEED_ADMIN_PASSWORD always reflects the current password.
		if err := auth.UpdatePassword(db, adminUser, adminPass); err != nil {
			logger.Warn("CYBERFEED_ADMIN_PASSWORD set but could not update password",
				"username", adminUser, "error", err)
		} else {
			logger.Info("updated admin password from environment", "username", adminUser)
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Prune expired sessions every hour.
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if err := auth.PruneSessions(db); err != nil {
					logger.Warn("prune sessions", "error", err)
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	// Open the NDJSON security-event audit log.
	auditPath := os.Getenv("CYBERFEED_AUDIT_LOG")
	if auditPath == "" {
		auditPath = "security-events.json"
	}
	auditLog, err := audit.New(auditPath)
	if err != nil {
		// Non-fatal: warn and continue without audit logging.
		logger.Warn("could not open audit log — security events will not be recorded",
			"path", auditPath, "error", err)
	} else {
		defer auditLog.Close()
		logger.Info("audit log opened", "path", auditPath)
	}

	agg := aggregator.New(feeds, logger, st)
	go agg.StartAutoRefresh(ctx, 20*time.Minute)

	srv, err := server.New(server.Config{
		Addr:     ":8888",
		Logger:   logger,
		DB:       db,
		AuditLog: auditLog,
	}, agg, staticFS)
	if err != nil {
		logger.Error("create server", "error", err)
		os.Exit(1)
	}

	go srv.StartLimiterPruner(ctx)

	go func() {
		<-ctx.Done()
		logger.Info("received shutdown signal, draining requests…")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			logger.Error("shutdown error", "error", err)
		}
	}()

	if err := srv.ListenAndServe(); err != nil {
		var opErr *net.OpError
		if errors.As(err, &opErr) && opErr.Op == "listen" {
			logger.Error("port already in use — stop the existing cyberfeed process first",
				"addr", ":8888", "error", err)
		} else {
			logger.Error("server stopped", "error", err)
		}
		os.Exit(1)
	}
}
