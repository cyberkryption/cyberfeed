package fetcher

import (
	"encoding/csv"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// ParseCSV converts a downloaded C2IntelFeeds CSV file into FeedItems.
// Column mapping is inferred from the header row; the first column header
// may carry a leading '#' comment marker which is stripped.
//
// Supported file schemas (all from drb-ra/C2IntelFeeds):
//
//	IPC2s.csv              — #ip, ioc
//	IPPortC2s.csv          — #ip, port, ioc
//	domainC2s.csv          — #domain, ioc
//	domainC2swithURL*.csv  — #domain, ioc, uri_path
//	domainC2swithURLwithIP — #domain, ioc, uri_path, ip
//	DNSC2Domains.csv       — #domain, ioc, IPs, C2Domains
func ParseCSV(sourceName, sourceURL string, data []byte) ([]FeedItem, error) {
	r := csv.NewReader(strings.NewReader(string(data)))
	r.FieldsPerRecord = -1 // rows may have varying column counts
	r.LazyQuotes = true
	r.TrimLeadingSpace = true

	rows, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("csv parse: %w", err)
	}
	if len(rows) < 2 {
		return nil, nil
	}

	// Build column index from header; strip leading '#' and normalise to lowercase.
	colIdx := make(map[string]int, len(rows[0]))
	for i, h := range rows[0] {
		key := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(h, "#")))
		colIdx[key] = i
	}

	now := time.Now().UTC().Truncate(24 * time.Hour) // stable daily timestamp
	items := make([]FeedItem, 0, len(rows)-1)
	for _, row := range rows[1:] {
		if len(row) == 0 {
			continue
		}
		item := buildC2Item(sourceName, sourceURL, colIdx, row, now)
		if item != nil {
			items = append(items, *item)
		}
	}
	return items, nil
}

// buildC2Item maps a single CSV row to a FeedItem using detected column layout.
func buildC2Item(sourceName, sourceURL string, colIdx map[string]int, row []string, now time.Time) *FeedItem {
	get := func(key string) string {
		i, ok := colIdx[key]
		if !ok || i >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[i])
	}

	ip := get("ip")
	domain := get("domain")
	port := get("port")
	ioc := get("ioc")
	uriPath := get("uri_path")
	resolvedIPs := get("ips")       // DNSC2Domains: column header "IPs"
	c2Domains := get("c2domains")   // DNSC2Domains: column header "C2Domains"

	var title, description, link string
	var categories []string

	switch {
	case port != "" && ip != "":
		// IPPortC2s: #ip, port, ioc
		title = ip + ":" + port
		description = ioc
		link = vtIPURL(ip)
		categories = []string{"C2", "IP", "Port"}

	case ip != "" && domain == "":
		// IPC2s: #ip, ioc
		title = ip
		description = ioc
		link = vtIPURL(ip)
		categories = []string{"C2", "IP"}

	case domain != "" && uriPath != "" && ip != "":
		// domainC2swithURLwithIP: #domain, ioc, uri_path, ip
		title = domain + uriPath
		description = ioc + " | IP: " + ip
		link = vtDomainURL(domain)
		categories = []string{"C2", "Domain", "URL", "IP"}

	case domain != "" && uriPath != "":
		// domainC2swithURL variants: #domain, ioc, uri_path
		title = domain + uriPath
		description = ioc
		link = vtDomainURL(domain)
		categories = []string{"C2", "Domain", "URL"}

	case domain != "" && (resolvedIPs != "" || c2Domains != ""):
		// DNSC2Domains: #domain, ioc, IPs, C2Domains
		title = domain
		parts := []string{ioc}
		if resolvedIPs != "" {
			parts = append(parts, "IPs: "+resolvedIPs)
		}
		if c2Domains != "" {
			parts = append(parts, "NS: "+c2Domains)
		}
		description = strings.Join(parts, " | ")
		link = vtDomainURL(domain)
		categories = []string{"C2", "DNS", "Domain"}

	case domain != "":
		// domainC2s: #domain, ioc
		title = domain
		description = ioc
		link = vtDomainURL(domain)
		categories = []string{"C2", "Domain"}

	default:
		return nil
	}

	if title == "" {
		return nil
	}

	return &FeedItem{
		Source:      sourceName,
		SourceURL:   sourceURL,
		Title:       title,
		Link:        link,
		Description: description,
		Published:   now,
		Author:      "C2IntelFeeds",
		Categories:  categories,
	}
}

func vtIPURL(ip string) string {
	return "https://www.virustotal.com/gui/ip-address/" + url.PathEscape(ip)
}

func vtDomainURL(domain string) string {
	// Guard against any accidental path component (domains should be bare).
	domain = strings.SplitN(domain, "/", 2)[0]
	return "https://www.virustotal.com/gui/domain/" + url.PathEscape(domain)
}
