package main

import (
	"bytes"
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

	"golang.org/x/crypto/bcrypt"
	"golang.org/x/term"

	"github.com/cyberkryption/cyberfeed/internal/aggregator"
	"github.com/cyberkryption/cyberfeed/internal/fetcher"
	"github.com/cyberkryption/cyberfeed/internal/server"
	"github.com/cyberkryption/cyberfeed/internal/store"
)

//go:embed web/dist
var embeddedWeb embed.FS

func main() {
	if len(os.Args) > 1 && os.Args[1] == "hash-password" {
		runHashPassword()
		return
	}

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

	dbPath := os.Getenv("CYBERFEED_DB")
	if dbPath == "" {
		dbPath = "cyberfeed.db"
	}
	st, err := store.Open(dbPath)
	if err != nil {
		logger.Warn("could not open store, running without persistence", "path", dbPath, "error", err)
		st = nil
	} else {
		logger.Info("store opened", "path", dbPath)
		defer st.Close()
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	agg := aggregator.New(feeds, logger, st)
	go agg.StartAutoRefresh(ctx, 20*time.Minute)

	srv, err := server.New(server.Config{
		Addr:         ":8888",
		Logger:       logger,
		PasswordHash: os.Getenv("CYBERFEED_PASSWORD_HASH"),
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

// runHashPassword prompts for a password (twice for confirmation), generates a
// bcrypt hash at cost 12, and prints it to stdout. No other tools required.
func runHashPassword() {
	fmt.Fprint(os.Stderr, "Enter password: ")
	pw, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Fprintln(os.Stderr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error reading password: %v\n", err)
		os.Exit(1)
	}

	fmt.Fprint(os.Stderr, "Confirm password: ")
	pw2, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Fprintln(os.Stderr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error reading password: %v\n", err)
		os.Exit(1)
	}

	if !bytes.Equal(pw, pw2) {
		fmt.Fprintln(os.Stderr, "passwords do not match")
		os.Exit(1)
	}

	if len(pw) == 0 {
		fmt.Fprintln(os.Stderr, "password must not be empty")
		os.Exit(1)
	}

	hash, err := bcrypt.GenerateFromPassword(pw, 12)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error generating hash: %v\n", err)
		os.Exit(1)
	}

	fmt.Println(string(hash))
}
