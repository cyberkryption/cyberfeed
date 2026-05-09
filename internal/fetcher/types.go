package fetcher

import "time"

// FeedConfig holds configuration for a single RSS feed source.
type FeedConfig struct {
	Name string
	URL  string
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
}
