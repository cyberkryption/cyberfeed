package main

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cyberkryption/cyberfeed/internal/aggregator"
	"github.com/cyberkryption/cyberfeed/internal/auth"
	"github.com/cyberkryption/cyberfeed/internal/fetcher"
	"github.com/cyberkryption/cyberfeed/internal/server"
	"github.com/cyberkryption/cyberfeed/internal/store"
)

//go:embed web/dist
var embeddedWeb embed.FS

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

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

	count, err := auth.UserCount(db)
	if err != nil {
		logger.Error("check user count", "error", err)
		os.Exit(1)
	}

	if count == 0 {
		adminUser := os.Getenv("CYBERFEED_ADMIN_USERNAME")
		if adminUser == "" {
			adminUser = "admin"
		}
		adminPass := os.Getenv("CYBERFEED_ADMIN_PASSWORD")
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

	agg := aggregator.New(feeds, logger, st)
	go agg.StartAutoRefresh(ctx, 20*time.Minute)

	srv, err := server.New(server.Config{
		Addr:   ":8888",
		Logger: logger,
		DB:     db,
	}, agg, staticFS)
	if err != nil {
		logger.Error("create server", "error", err)
		os.Exit(1)
	}

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
