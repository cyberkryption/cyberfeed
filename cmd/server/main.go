package main

import (
	"context"
	"embed"
	"io/fs"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"cyberfeed/internal/aggregator"
	"cyberfeed/internal/fetcher"
	"cyberfeed/internal/server"
)

//go:embed web/dist
var embeddedWeb embed.FS

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	// Strip the "web/dist" prefix so the embedded FS root is the dist folder.
	staticFS, err := fs.Sub(embeddedWeb, "web/dist")
	if err != nil {
		logger.Error("sub embedded fs", "error", err)
		os.Exit(1)
	}

	// Load feeds from feeds.txt if present, otherwise fall back to defaults.
	feeds, err := fetcher.LoadFeedsFile("feeds.txt")
	if err != nil {
		logger.Warn("could not load feeds.txt, using built-in defaults", "error", err)
		feeds = fetcher.DefaultFeeds
	} else {
		logger.Info("loaded feeds from feeds.txt", "count", len(feeds))
		for i, f := range feeds {
			logger.Info("  feed", "index", i+1, "name", f.Name, "url", f.URL)
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	agg := aggregator.New(feeds, logger)

	// Start background refresh goroutine (every 15 minutes).
	// The first fetch happens immediately inside StartAutoRefresh.
	go agg.StartAutoRefresh(ctx, 15*time.Minute)

	srv, err := server.New(server.Config{
		Addr:   ":8888",
		Logger: logger,
	}, agg, staticFS)
	if err != nil {
		logger.Error("create server", "error", err)
		os.Exit(1)
	}

	// Graceful shutdown: wait for signal, then drain in-flight requests.
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
		if strings.Contains(err.Error(), "bind") || strings.Contains(err.Error(), "address already in use") || strings.Contains(err.Error(), "Only one usage") {
			logger.Error("port already in use — stop the existing cyberfeed process first (e.g. kill the previous terminal or run: pkill cyberfeed)", "addr", ":8888", "error", err)
		} else {
			logger.Error("server stopped", "error", err)
		}
		os.Exit(1)
	}
}
