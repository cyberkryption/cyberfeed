package fetcher

import "time"

// FeedConfig holds configuration for a single RSS feed source.
// Parser controls how the feed is parsed: "auto" (default) infers from the
// URL extension (.csv → CSV, .json → JSON, otherwise RSS/Atom), "xml" forces
// RSS/Atom, "csv" forces the CSV threat-intel parser, "json" forces the JSON
// threat-intel parser.
// Category controls which sidebar pane the feed appears in: "auto" (default)
// uses URL-extension detection, "news" forces the NEWS pane, "threat_intel"
// forces the THREAT INTEL pane.
// RefreshInterval overrides the global refresh schedule; 0 means use the global default.
type FeedConfig struct {
	Name            string
	URL             string
	Parser          string        // "auto" | "xml" | "csv" | "json"
	Category        string        // "auto" | "news" | "threat_intel"
	RefreshInterval time.Duration // 0 = use global default
}

// FeedItem represents a single parsed RSS/Atom entry.
type FeedItem struct {
	Source      string    `json:"source"`
	SourceURL   string    `json:"sourceUrl"`
	Title       string    `json:"title"`
	Link        string    `json:"link"`
	Description string    `json:"description"`
	Published   time.Time `json:"published"`
	Author      string    `json:"author"`
	Categories  []string  `json:"categories"`
}

// FeedResult is the result returned on the channel from a single worker.
type FeedResult struct {
	Config FeedConfig
	Items  []FeedItem
	Err    error
}

// DefaultFeeds is the built-in list of cybersecurity feeds, kept in sync with feeds.txt.
var DefaultFeeds = []FeedConfig{
	{Name: "CVE High and Critical", URL: "https://cvefeed.io/rssfeed/severity/high.xml"},
	{Name: "CVE Feeds Newsroom", URL: "https://cvefeed.io/rssfeed/newsroom.xml"},
	{Name: "NCSC Threat Reports", URL: "https://www.ncsc.gov.uk/api/1/services/v1/report-rss-feed.xml"},
	{Name: "Microsoft Security Blog", URL: "https://www.microsoft.com/en-us/security/blog/feed/"},
	{Name: "Risky Business", URL: "https://risky.biz/feeds/risky-business-news"},
	{Name: "SANS Internet Storm Center", URL: "https://isc.sans.edu/rssfeed.xml"},
	{Name: "PortSwigger Research", URL: "https://portswigger.net/research/rss"},
	{Name: "AWS Security Blog", URL: "https://aws.amazon.com/blogs/security/feed/"},
	{Name: "TrustedSec", URL: "https://www.trustedsec.com/feed.rss"},
	{Name: "Snyk Security", URL: "https://snyk.io/blog/feed/"},
	{Name: "Industrial Cyber", URL: "https://industrialcyber.co/feed/"},
	{Name: "Didier Stevens Blog", URL: "https://blog.didierstevens.com/feed/"},
	// C2 indicator feeds (CSV)
	{Name: "C2 DNS Domains", URL: "https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/DNSC2Domains.csv"},
	{Name: "C2 IPs", URL: "https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/IPC2s.csv"},
	{Name: "C2 IP:Port", URL: "https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/IPPortC2s.csv"},
	{Name: "C2 Domains", URL: "https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/domainC2s.csv"},
	{Name: "C2 Domains (URL filtered)", URL: "https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/domainC2swithURL-filter-abused.csv"},
	{Name: "C2 Domains with URL", URL: "https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/domainC2swithURL.csv"},
	{Name: "C2 Domains with URL+IP", URL: "https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/domainC2swithURLwithIP.csv"},
}
