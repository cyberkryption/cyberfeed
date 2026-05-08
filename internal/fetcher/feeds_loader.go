package fetcher

import (
	"bufio"
	"fmt"
	"net/url"
	"os"
	"strings"
)

// LoadFeedsFile reads feed definitions from a plain-text file.
//
// Each non-blank, non-comment line must be in one of these formats:
//
//	<URL>                  — hostname is used as the display name
//	<Name> | <URL>         — explicit name on the left
//	<URL> | <Name>         — explicit name on the right (auto-detected)
//
// Lines starting with '#' are treated as comments and ignored.
// The https:// scheme is added automatically when omitted.
//
// Example feeds.txt:
//
//	# My custom cybersecurity feeds
//	SANS Internet Storm Center | https://isc.sans.edu/rssfeed.xml
//	https://googleprojectzero.blogspot.com/feeds/posts/default
//	bleepingcomputer.com/feed/ | Bleeping Computer
func LoadFeedsFile(path string) ([]FeedConfig, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()

	var feeds []FeedConfig
	lineNum := 0
	scanner := bufio.NewScanner(f)

	for scanner.Scan() {
		lineNum++
		line := strings.TrimSpace(scanner.Text())

		// Skip blank lines and comments.
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		var name, rawURL string

		if idx := strings.Index(line, "|"); idx != -1 {
			left := strings.TrimSpace(line[:idx])
			right := strings.TrimSpace(line[idx+1:])

			// Auto-detect which side is the URL: whichever side looks like a
			// URL (contains "://" or "." followed by "/") is treated as the URL.
			if looksLikeURL(left) {
				rawURL = left
				name = right
			} else {
				name = left
				rawURL = right
			}
		} else {
			// URL-only — derive name from hostname.
			rawURL = line
		}

		if rawURL == "" {
			return nil, fmt.Errorf("%s line %d: could not identify a URL", path, lineNum)
		}

		// Ensure the URL has a scheme.
		if !strings.Contains(rawURL, "://") {
			rawURL = "https://" + rawURL
		}

		// Use net/url for robust parsing and hostname extraction.
		parsed, err := url.Parse(rawURL)
		if err != nil {
			return nil, fmt.Errorf("%s line %d: invalid URL %q: %w", path, lineNum, rawURL, err)
		}

		// Fall back to hostname when no name was provided.
		if name == "" {
			name = parsed.Hostname()
		}
		// Final safety net — should never be hit, but prevents blank sidebar entries.
		if name == "" {
			name = rawURL
		}

		feeds = append(feeds, FeedConfig{Name: name, URL: rawURL})
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan %s: %w", path, err)
	}
	if len(feeds) == 0 {
		return nil, fmt.Errorf("%s contains no feed definitions", path)
	}

	return feeds, nil
}

// looksLikeURL returns true when s appears to be a URL rather than a plain name.
// It matches strings with a scheme ("://") or a domain-like prefix ("word.word/").
func looksLikeURL(s string) bool {
	if strings.Contains(s, "://") {
		return true
	}
	// Match bare domains like "example.com/path"
	if idx := strings.Index(s, "/"); idx > 0 {
		host := s[:idx]
		return strings.Contains(host, ".")
	}
	// Match bare domains with no path like "example.com"
	return strings.Count(s, ".") >= 1 && !strings.ContainsAny(s, " \t")
}
