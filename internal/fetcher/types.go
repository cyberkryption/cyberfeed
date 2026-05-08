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

// DefaultFeeds is the list of cybersecurity feeds to pull.
var DefaultFeeds = []FeedConfig{
	{Name: "CCCS Alerts & Advisories", URL: "https://www.cyber.gc.ca/api/cccs/rss/v1/get?feed=alerts_advisories&lang=en"},
	{Name: "Australian Cyber Security Centre", URL: "https://www.cyber.gov.au/rss/news"},
	{Name: "Microsoft Security Blog", URL: "https://www.microsoft.com/en-us/security/blog/feed/"},
	{Name: "SANS Internet Storm Center", URL: "https://isc.sans.edu/rssfeed.xml"},
	{Name: "Google Project Zero", URL: "https://googleprojectzero.blogspot.com/feeds/posts/default"},
	{Name: "PortSwigger Research", URL: "https://portswigger.net/research/rss"},
	{Name: "AWS Security Blog", URL: "https://aws.amazon.com/blogs/security/feed/"},
	{Name: "TrustedSec", URL: "https://www.trustedsec.com/feed.rss"},
	{Name: "Snyk Security", URL: "https://snyk.io/blog/feed/"},
	{Name: "Industrial Cyber", URL: "https://industrialcyber.co/feed/"},
	{Name: "Didier Stevens Blog", URL: "https://blog.didierstevens.com/feed/"},
}
