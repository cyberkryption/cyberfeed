package fetcher

import (
	"encoding/xml"
	"fmt"
	"html"
	"strings"
	"time"

	"github.com/microcosm-cc/bluemonday"
)

// stripHTML sanitises HTML using a strict allowlist (no tags, no attributes).
var stripHTML = bluemonday.StrictPolicy()

// --- RSS 2.0 structures ---

type rssRoot struct {
	XMLName xml.Name   `xml:"rss"`
	Channel rssChannel `xml:"channel"`
}

type rssChannel struct {
	Items []rssItem `xml:"item"`
}

type rssItem struct {
	Title       string   `xml:"title"`
	Link        string   `xml:"link"`
	Description string   `xml:"description"`
	PubDate     string   `xml:"pubDate"`
	Author      string   `xml:"author"`
	Creator     string   `xml:"creator"`
	Categories  []string `xml:"category"`
	Encoded     string   `xml:"encoded"`
}

// --- Atom structures ---

type atomFeed struct {
	XMLName xml.Name    `xml:"feed"`
	Entries []atomEntry `xml:"entry"`
}

type atomEntry struct {
	Title      atomText       `xml:"title"`
	Links      []atomLink     `xml:"link"`
	Published  string         `xml:"published"`
	Updated    string         `xml:"updated"`
	Author     atomAuthor     `xml:"author"`
	Summary    atomText       `xml:"summary"`
	Content    atomText       `xml:"content"`
	Categories []atomCategory `xml:"category"`
}

type atomText struct {
	Type  string `xml:"type,attr"`
	Value string `xml:",chardata"`
	Inner string `xml:",innerxml"`
}

type atomLink struct {
	Href string `xml:"href,attr"`
	Rel  string `xml:"rel,attr"`
}

type atomAuthor struct {
	Name string `xml:"name"`
}

type atomCategory struct {
	Term string `xml:"term,attr"`
}

// parseXML attempts to parse raw XML bytes as either RSS 2.0 or Atom.
func parseXML(data []byte, cfg FeedConfig) ([]FeedItem, error) {
	// Sniff the root element.
	type probe struct {
		XMLName xml.Name
	}
	var p probe
	if err := xml.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("probe root element: %w", err)
	}

	switch strings.ToLower(p.XMLName.Local) {
	case "rss":
		return parseRSS(data, cfg)
	case "feed":
		return parseAtom(data, cfg)
	default:
		return nil, fmt.Errorf("unknown feed format: %s", p.XMLName.Local)
	}
}

func parseRSS(data []byte, cfg FeedConfig) ([]FeedItem, error) {
	var root rssRoot
	if err := xml.Unmarshal(data, &root); err != nil {
		return nil, fmt.Errorf("unmarshal rss: %w", err)
	}
	now := time.Now().UTC()
	items := make([]FeedItem, 0, len(root.Channel.Items))
	for _, ri := range root.Channel.Items {
		pub := parseDate(ri.PubDate)
		if pub.IsZero() {
			pub = now // fall back to fetch time so items sort sensibly
		}
		desc := ri.Description
		if ri.Encoded != "" {
			desc = ri.Encoded
		}
		author := ri.Author
		if author == "" {
			author = ri.Creator
		}
		items = append(items, FeedItem{
			Source:      cfg.Name,
			SourceURL:   cfg.URL,
			Title:       cleanText(ri.Title),
			Link:        sanitizeURL(strings.TrimSpace(ri.Link)),
			Description: cleanHTML(desc),
			Published:   pub,
			Author:      cleanText(author),
			Categories:  ri.Categories,
		})
	}
	return items, nil
}

func parseAtom(data []byte, cfg FeedConfig) ([]FeedItem, error) {
	var feed atomFeed
	if err := xml.Unmarshal(data, &feed); err != nil {
		return nil, fmt.Errorf("unmarshal atom: %w", err)
	}
	now := time.Now().UTC()
	items := make([]FeedItem, 0, len(feed.Entries))
	for _, e := range feed.Entries {
		pub := parseDate(e.Published)
		if pub.IsZero() {
			pub = parseDate(e.Updated)
		}
		if pub.IsZero() {
			pub = now // fall back to fetch time so items sort sensibly
		}
		link := ""
		for _, l := range e.Links {
			if l.Rel == "alternate" || l.Rel == "" {
				link = l.Href
				break
			}
		}
		desc := e.Summary.Value
		if desc == "" {
			desc = e.Content.Value
		}
		if desc == "" {
			desc = e.Summary.Inner
		}
		cats := make([]string, 0, len(e.Categories))
		for _, c := range e.Categories {
			if c.Term != "" {
				cats = append(cats, c.Term)
			}
		}
		items = append(items, FeedItem{
			Source:      cfg.Name,
			SourceURL:   cfg.URL,
			Title:       cleanText(e.Title.Value),
			Link:        sanitizeURL(strings.TrimSpace(link)),
			Description: cleanHTML(desc),
			Published:   pub,
			Author:      cleanText(e.Author.Name),
			Categories:  cats,
		})
	}
	return items, nil
}

var rssDateFormats = []string{
	time.RFC1123Z,
	time.RFC1123,
	time.RFC3339,
	"Mon, 2 Jan 2006 15:04:05 -0700",
	"Mon, 2 Jan 2006 15:04:05 MST",
	"2006-01-02T15:04:05Z",
	"2006-01-02T15:04:05-07:00",
	"2006-01-02 15:04:05",
}

func parseDate(s string) time.Time {
	s = strings.TrimSpace(s)
	for _, layout := range rssDateFormats {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC()
		}
	}
	return time.Time{}
}

// cleanText decodes HTML entities and trims whitespace.
func cleanText(s string) string {
	return strings.TrimSpace(html.UnescapeString(s))
}

// cleanHTML strips all HTML tags via bluemonday's strict policy, then decodes
// entities, collapses whitespace, and truncates to 400 runes.
func cleanHTML(s string) string {
	s = strings.TrimSpace(s)

	// Unwrap bare CDATA that wasn't parsed as XML.
	s = strings.TrimPrefix(s, "<![CDATA[")
	s = strings.TrimSuffix(s, "]]>")

	result := stripHTML.Sanitize(s)
	result = html.UnescapeString(result)
	result = strings.Join(strings.Fields(result), " ")

	const maxLen = 400
	runes := []rune(result)
	if len(runes) > maxLen {
		result = string(runes[:maxLen]) + "…"
	}
	return result
}

// sanitizeURL returns u unchanged when its scheme is http or https, and returns
// an empty string for any other scheme (javascript:, data:, vbscript:, etc.).
func sanitizeURL(u string) string {
	lower := strings.ToLower(u)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		return u
	}
	return ""
}

