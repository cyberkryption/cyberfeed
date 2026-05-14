package fetcher

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"time"
)

// ParseJSON parses a JSON threat-intel feed into FeedItems.
//
// Supported formats:
//   - Newline-delimited JSON (NDJSON): one object per line
//   - C2IntelFeeds wrapper: {"preview":false,"offset":N,"result":{...}} per line
//   - Plain JSON array: [{...},{...}]
//   - Single JSON object: {...}
func ParseJSON(sourceName, sourceURL string, data []byte) ([]FeedItem, error) {
	records, err := parseJSONRecords(data)
	if err != nil {
		return nil, fmt.Errorf("json parse %s: %w", sourceName, err)
	}

	now := time.Now().UTC().Truncate(24 * time.Hour)
	items := make([]FeedItem, 0, len(records))
	for _, rec := range records {
		item := buildJSONItem(sourceName, sourceURL, rec, now)
		if item != nil {
			items = append(items, *item)
		}
	}
	return items, nil
}

// parseJSONRecords normalises the various JSON feed shapes into a flat slice
// of string-keyed maps.
func parseJSONRecords(data []byte) ([]map[string]any, error) {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 {
		return nil, nil
	}

	// JSON array?
	if trimmed[0] == '[' {
		var arr []map[string]any
		if err := json.Unmarshal(trimmed, &arr); err != nil {
			return nil, err
		}
		return arr, nil
	}

	// NDJSON (one object per line)
	lines := bytes.Split(trimmed, []byte("\n"))
	var records []map[string]any
	for _, line := range lines {
		line = bytes.TrimSpace(line)
		if len(line) == 0 {
			continue
		}
		var obj map[string]any
		if err := json.Unmarshal(line, &obj); err != nil {
			continue // skip malformed lines
		}
		// Unwrap C2IntelFeeds envelope: {"preview":...,"result":{...}}
		if result, ok := obj["result"].(map[string]any); ok {
			records = append(records, result)
		} else {
			records = append(records, obj)
		}
	}
	return records, nil
}

// buildJSONItem converts one JSON record to a FeedItem using best-effort field
// detection. It handles the poshc2.json schema (ip, C2Url, FirstSeen, ASN*)
// and falls back to generic field names for other feeds.
func buildJSONItem(sourceName, sourceURL string, rec map[string]any, now time.Time) *FeedItem {
	str := func(keys ...string) string {
		for _, k := range keys {
			switch v := rec[k].(type) {
			case string:
				if v != "" {
					return v
				}
			case float64:
				return fmt.Sprintf("%g", v)
			}
		}
		return ""
	}

	// Primary indicator: prefer IP, then domain/host.
	ip := str("ip", "IP")
	domain := str("domain", "host", "hostname")
	primary := ip
	if primary == "" {
		primary = domain
	}

	// Title: prefer an explicit title/name, fall back to the primary indicator.
	title := str("title", "name", "label")
	if title == "" {
		title = primary
	}
	if title == "" {
		return nil
	}

	// Link: VirusTotal deep-link based on type of indicator.
	var link string
	if ip != "" {
		if net.ParseIP(ip) != nil {
			link = vtIPURL(ip)
		} else {
			link = vtDomainURL(ip) // not a valid IP — treat as domain
		}
	} else if domain != "" {
		link = vtDomainURL(domain)
	} else {
		// No useful indicator — use source URL + title as a stable fallback key.
		link = sourceURL + "#" + title
	}

	// Description: C2Url(s), ASN info, and any explicit description/ioc field.
	var parts []string
	if ioc := str("ioc", "description", "info", "comment"); ioc != "" {
		parts = append(parts, ioc)
	}
	// C2Url can be a string or an array.
	switch v := rec["C2Url"].(type) {
	case string:
		if v != "" {
			parts = append(parts, "C2: "+v)
		}
	case []any:
		var urls []string
		for _, u := range v {
			if s, ok := u.(string); ok && s != "" {
				urls = append(urls, s)
			}
		}
		if len(urls) > 0 {
			parts = append(parts, "C2: "+strings.Join(urls, ", "))
		}
	}
	if asn := str("ASNName"); asn != "" {
		parts = append(parts, "ASN: "+asn)
	}
	if asnNum := str("ASN"); asnNum != "" {
		parts = append(parts, "AS"+asnNum)
	}
	description := strings.Join(parts, " | ")

	// Published: parse FirstSeen if present, otherwise use daily bucket.
	published := now
	if fs := str("FirstSeen"); fs != "" {
		if t, err := time.Parse("2006-01-02 15:04:05 MST", fs); err == nil {
			published = t.UTC()
		}
	}

	// Categories.
	categories := []string{"C2"}
	if ip != "" {
		categories = append(categories, "IP")
	} else if domain != "" {
		categories = append(categories, "Domain")
	}

	return &FeedItem{
		Source:      sourceName,
		SourceURL:   sourceURL,
		Title:       title,
		Link:        link,
		Description: description,
		Published:   published,
		Author:      "C2IntelFeeds",
		Categories:  categories,
	}
}
