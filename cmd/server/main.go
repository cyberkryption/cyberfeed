package main

import (
	"context"
	"embed"
	"errors"
	"io/fs"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cyberkryption/cyberfeed/internal/aggregator"
	"github.com/cyberkryption/cyberfeed/internal/fetcher"
	"github.com/cyberkryption/cyberfeed/internal/server"
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

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	agg := aggregator.New(feeds, logger)
	go agg.StartAutoRefresh(ctx, 20*time.Minute)

	srv, err := server.New(server.Config{
		Addr:   ":8888",
		Logger: logger,
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
