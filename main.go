package main

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// ─── RSS / Atom structs ──────────────────────────────────────────────────────

type RSS struct {
	XMLName xml.Name   `xml:"rss"`
	Channel RSSChannel `xml:"channel"`
}

type RSSChannel struct {
	Title string    `xml:"title"`
	Items []RSSItem `xml:"item"`
}

type RSSItem struct {
	Title   string `xml:"title"`
	Link    string `xml:"link"`
	PubDate string `xml:"pubDate"`
	Desc    string `xml:"description"`
	GUID    string `xml:"guid"`
}

type Atom struct {
	XMLName xml.Name    `xml:"feed"`
	Title   string      `xml:"title"`
	Entries []AtomEntry `xml:"entry"`
}

type AtomEntry struct {
	Title   string     `xml:"title"`
	Links   []AtomLink `xml:"link"`
	Updated string     `xml:"updated"`
	Summary string     `xml:"summary"`
	ID      string     `xml:"id"`
}

type AtomLink struct {
	Href string `xml:"href,attr"`
	Rel  string `xml:"rel,attr"`
}

// ─── Unified item ────────────────────────────────────────────────────────────

type FeedItem struct {
	Title      string    `json:"title"`
	Link       string    `json:"link"`
	Published  time.Time `json:"published"`
	Source     string    `json:"source"`
	SourceURL  string    `json:"source_url"`
	Summary    string    `json:"summary"`
}

// ─── Feed sources ────────────────────────────────────────────────────────────

type FeedSource struct {
	URL   string
	Label string
}

var feedSources = []FeedSource{
	{"https://www.cyber.gc.ca/api/cccs/rss/v1/get?feed=alerts_advisories&lang=en", "CCCS Alerts"},
	{"https://www.cyber.gov.au/rss/news", "ASD ACSC"},
	{"https://www.microsoft.com/en-us/security/blog/feed/", "Microsoft Security"},
	{"https://isc.sans.edu/rssfeed.xml", "SANS ISC"},
	{"https://googleprojectzero.blogspot.com/feeds/posts/default", "Project Zero"},
	{"https://portswigger.net/research/rss", "PortSwigger"},
	{"https://aws.amazon.com/blogs/security/feed/", "AWS Security"},
	{"https://www.trustedsec.com/feed.rss", "TrustedSec"},
	{"https://snyk.io/blog/feed/", "Snyk"},
	{"https://industrialcyber.co/feed/", "Industrial Cyber"},
	{"https://blog.didierstevens.com/feed/", "Didier Stevens"},
}

// ─── Cache ───────────────────────────────────────────────────────────────────

type Cache struct {
	mu          sync.RWMutex
	items       []FeedItem
	lastUpdated time.Time
	errors      map[string]string
}

var cache = &Cache{errors: make(map[string]string)}

// ─── Fetch & parse ───────────────────────────────────────────────────────────

var httpClient = &http.Client{Timeout: 15 * time.Second}

func fetchFeed(src FeedSource) ([]FeedItem, error) {
	req, err := http.NewRequest("GET", src.URL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "CyberFeedAggregator/1.0")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return nil, err
	}

	// Try RSS first
	var rss RSS
	if err := xml.Unmarshal(body, &rss); err == nil && len(rss.Channel.Items) > 0 {
		return rssToItems(rss, src), nil
	}

	// Try Atom
	var atom Atom
	if err := xml.Unmarshal(body, &atom); err == nil && len(atom.Entries) > 0 {
		return atomToItems(atom, src), nil
	}

	return nil, fmt.Errorf("could not parse feed (tried RSS and Atom)")
}

func rssToItems(rss RSS, src FeedSource) []FeedItem {
	items := make([]FeedItem, 0, len(rss.Channel.Items))
	for _, it := range rss.Channel.Items {
		t := parseTime(it.PubDate)
		link := strings.TrimSpace(it.Link)
		if link == "" {
			link = it.GUID
		}
		items = append(items, FeedItem{
			Title:     cleanString(it.Title),
			Link:      link,
			Published: t,
			Source:    src.Label,
			SourceURL: src.URL,
			Summary:   stripHTML(it.Desc),
		})
	}
	return items
}

func atomToItems(atom Atom, src FeedSource) []FeedItem {
	items := make([]FeedItem, 0, len(atom.Entries))
	for _, e := range atom.Entries {
		t := parseTime(e.Updated)
		link := ""
		for _, l := range e.Links {
			if l.Rel == "alternate" || l.Rel == "" {
				link = l.Href
				break
			}
		}
		if link == "" && len(e.Links) > 0 {
			link = e.Links[0].Href
		}
		items = append(items, FeedItem{
			Title:     cleanString(e.Title),
			Link:      link,
			Published: t,
			Source:    src.Label,
			SourceURL: src.URL,
			Summary:   stripHTML(e.Summary),
		})
	}
	return items
}

// ─── Refresh loop ─────────────────────────────────────────────────────────────

func refreshFeeds() {
	type result struct {
		items []FeedItem
		src   FeedSource
		err   error
	}

	results := make(chan result, len(feedSources))
	var wg sync.WaitGroup

	for _, src := range feedSources {
		wg.Add(1)
		go func(s FeedSource) {
			defer wg.Done()
			items, err := fetchFeed(s)
			results <- result{items, s, err}
		}(src)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	var allItems []FeedItem
	errs := make(map[string]string)

	for r := range results {
		if r.err != nil {
			log.Printf("[WARN] %s: %v", r.src.Label, r.err)
			errs[r.src.Label] = r.err.Error()
		} else {
			allItems = append(allItems, r.items...)
		}
	}

	sort.Slice(allItems, func(i, j int) bool {
		return allItems[i].Published.After(allItems[j].Published)
	})

	cache.mu.Lock()
	cache.items = allItems
	cache.lastUpdated = time.Now()
	cache.errors = errs
	cache.mu.Unlock()

	log.Printf("[INFO] Refreshed: %d items from %d feeds (%d errors)",
		len(allItems), len(feedSources), len(errs))
}

func startRefreshLoop() {
	refreshFeeds()
	ticker := time.NewTicker(15 * time.Minute)
	go func() {
		for range ticker.C {
			refreshFeeds()
		}
	}()
}

// ─── HTTP handlers ────────────────────────────────────────────────────────────

func apiItemsHandler(w http.ResponseWriter, r *http.Request) {
	cache.mu.RLock()
	items := cache.items
	updated := cache.lastUpdated
	errs := cache.errors
	cache.mu.RUnlock()

	source := r.URL.Query().Get("source")
	search := strings.ToLower(r.URL.Query().Get("q"))

	filtered := make([]FeedItem, 0, len(items))
	for _, it := range items {
		if source != "" && it.Source != source {
			continue
		}
		if search != "" && !strings.Contains(strings.ToLower(it.Title), search) &&
			!strings.Contains(strings.ToLower(it.Summary), search) {
			continue
		}
		filtered = append(filtered, it)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"items":       filtered,
		"total":       len(filtered),
		"lastUpdated": updated,
		"errors":      errs,
	})
}

func refreshHandler(w http.ResponseWriter, r *http.Request) {
	go refreshFeeds()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "refresh triggered"})
}

func indexHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	tmpl := template.Must(template.New("index").Parse(indexHTML))
	sources := make([]string, len(feedSources))
	for i, s := range feedSources {
		sources[i] = s.Label
	}
	tmpl.Execute(w, map[string]interface{}{"Sources": sources})
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

var timeFormats = []string{
	time.RFC1123Z, time.RFC1123, time.RFC3339,
	"Mon, 2 Jan 2006 15:04:05 -0700",
	"Mon, 2 Jan 2006 15:04:05 MST",
	"2006-01-02T15:04:05Z",
	"2006-01-02T15:04:05-07:00",
	"2006-01-02 15:04:05",
}

func parseTime(s string) time.Time {
	s = strings.TrimSpace(s)
	for _, f := range timeFormats {
		if t, err := time.Parse(f, s); err == nil {
			return t
		}
	}
	return time.Time{}
}

func cleanString(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\r", "")
	return s
}

func stripHTML(s string) string {
	s = cleanString(s)
	var b strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			b.WriteRune(' ')
			continue
		}
		if !inTag {
			b.WriteRune(r)
		}
	}
	result := strings.Join(strings.Fields(b.String()), " ")
	if len(result) > 280 {
		result = result[:280] + "…"
	}
	return result
}

// ─── Main ─────────────────────────────────────────────────────────────────────

func main() {
	log.Println("[INFO] CyberFeed starting on :8888")
	startRefreshLoop()

	http.HandleFunc("/", indexHandler)
	http.HandleFunc("/api/items", apiItemsHandler)
	http.HandleFunc("/api/refresh", refreshHandler)

	log.Fatal(http.ListenAndServe(":8888", nil))
}

// ─── Embedded HTML ────────────────────────────────────────────────────────────

const indexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CyberFeed — Security Intelligence</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:        #080c10;
    --bg2:       #0d1117;
    --bg3:       #111820;
    --border:    #1e2d3d;
    --accent:    #00d4ff;
    --accent2:   #ff4c6a;
    --accent3:   #39ff14;
    --text:      #c9d8e8;
    --text-dim:  #56728a;
    --mono:      'Share Tech Mono', monospace;
    --sans:      'DM Sans', sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 15px; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* ── Scan-line overlay ── */
  body::before {
    content:'';
    position:fixed; inset:0; pointer-events:none; z-index:999;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0,212,255,.015) 2px,
      rgba(0,212,255,.015) 4px
    );
  }

  /* ── Header ── */
  header {
    position: sticky; top: 0; z-index: 100;
    background: rgba(8,12,16,.92);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    padding: 0 2rem;
    display: flex; align-items: center; gap: 2rem;
    height: 56px;
  }
  .logo {
    font-family: var(--mono);
    font-size: 1.05rem;
    color: var(--accent);
    letter-spacing: .12em;
    display: flex; align-items: center; gap: .5rem;
    flex-shrink: 0;
  }
  .logo::before {
    content: '>';
    color: var(--accent2);
    animation: blink 1.1s step-end infinite;
  }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

  .header-right {
    margin-left: auto;
    display: flex; align-items: center; gap: 1rem;
  }
  #status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--accent3);
    box-shadow: 0 0 8px var(--accent3);
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.85)} }
  #last-updated {
    font-family: var(--mono); font-size: .72rem; color: var(--text-dim);
  }
  #refresh-btn {
    font-family: var(--mono); font-size: .72rem;
    background: transparent; border: 1px solid var(--border);
    color: var(--accent); padding: .3rem .75rem; cursor: pointer;
    letter-spacing: .08em; transition: all .2s;
  }
  #refresh-btn:hover { border-color: var(--accent); background: rgba(0,212,255,.08); }

  /* ── Layout ── */
  .layout { display: flex; height: calc(100vh - 56px); }

  /* ── Sidebar ── */
  aside {
    width: 210px; flex-shrink: 0;
    background: var(--bg2);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    padding: 1.25rem 0;
  }
  aside::-webkit-scrollbar { width: 4px; }
  aside::-webkit-scrollbar-thumb { background: var(--border); }

  .sidebar-label {
    font-family: var(--mono); font-size: .65rem;
    color: var(--text-dim); letter-spacing: .15em;
    padding: 0 1rem .75rem;
    border-bottom: 1px solid var(--border);
    margin-bottom: .5rem;
  }
  .source-btn {
    display: block; width: 100%;
    font-family: var(--sans); font-size: .8rem;
    background: transparent; border: none;
    color: var(--text-dim); text-align: left;
    padding: .5rem 1rem;
    cursor: pointer; transition: all .15s;
    border-left: 2px solid transparent;
  }
  .source-btn:hover { color: var(--text); background: rgba(255,255,255,.03); }
  .source-btn.active {
    color: var(--accent);
    border-left-color: var(--accent);
    background: rgba(0,212,255,.06);
  }
  .source-btn .count {
    float: right;
    font-family: var(--mono); font-size: .65rem;
    color: var(--text-dim);
  }
  .source-btn.has-error { color: var(--accent2); }
  .source-btn.has-error .count { color: var(--accent2); }

  /* ── Main panel ── */
  main {
    flex: 1; overflow-y: auto;
    padding: 1.5rem 2rem;
  }
  main::-webkit-scrollbar { width: 6px; }
  main::-webkit-scrollbar-thumb { background: var(--border); }

  /* ── Search bar ── */
  .toolbar {
    display: flex; gap: 1rem; align-items: center;
    margin-bottom: 1.5rem;
  }
  #search {
    flex: 1; max-width: 480px;
    font-family: var(--mono); font-size: .82rem;
    background: var(--bg3); border: 1px solid var(--border);
    color: var(--text); padding: .55rem 1rem;
    outline: none; transition: border-color .2s;
  }
  #search::placeholder { color: var(--text-dim); }
  #search:focus { border-color: var(--accent); }
  #item-count {
    font-family: var(--mono); font-size: .72rem; color: var(--text-dim);
    margin-left: auto;
  }

  /* ── Feed items ── */
  #feed-list { display: flex; flex-direction: column; gap: .6rem; }

  .feed-item {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-left: 3px solid transparent;
    padding: .9rem 1rem;
    transition: all .18s;
    animation: slideIn .25s ease;
  }
  @keyframes slideIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
  .feed-item:hover {
    border-color: var(--border);
    border-left-color: var(--accent);
    background: var(--bg3);
  }
  .item-meta {
    display: flex; align-items: center; gap: .75rem;
    margin-bottom: .35rem;
  }
  .item-source {
    font-family: var(--mono); font-size: .65rem;
    color: var(--accent); letter-spacing: .08em;
    background: rgba(0,212,255,.08);
    padding: .15rem .45rem;
    white-space: nowrap;
  }
  .item-date {
    font-family: var(--mono); font-size: .65rem; color: var(--text-dim);
  }
  .item-title a {
    color: var(--text); text-decoration: none;
    font-weight: 500; font-size: .9rem; line-height: 1.4;
    transition: color .15s;
  }
  .item-title a:hover { color: var(--accent); }
  .item-summary {
    margin-top: .35rem;
    font-size: .78rem; color: var(--text-dim);
    line-height: 1.55; max-height: 0;
    overflow: hidden; transition: max-height .3s ease;
  }
  .feed-item:hover .item-summary { max-height: 120px; }

  /* ── Loading / empty states ── */
  .state-msg {
    font-family: var(--mono); font-size: .85rem;
    color: var(--text-dim); padding: 3rem;
    text-align: center; letter-spacing: .05em;
  }
  .spinner {
    width:28px; height:28px; border:2px solid var(--border);
    border-top-color:var(--accent); border-radius:50%;
    animation: spin .7s linear infinite;
    margin: 0 auto 1rem;
  }
  @keyframes spin { to{transform:rotate(360deg)} }

  /* ── Error banner ── */
  #error-bar {
    display:none; font-family:var(--mono); font-size:.72rem;
    color:var(--accent2); background:rgba(255,76,106,.07);
    border:1px solid rgba(255,76,106,.3);
    padding:.5rem 1rem; margin-bottom:1rem;
  }
</style>
</head>
<body>

<header>
  <div class="logo">CYBERFEED</div>
  <div class="header-right">
    <span id="status-dot"></span>
    <span id="last-updated">–</span>
    <button id="refresh-btn" onclick="triggerRefresh()">⟳ REFRESH</button>
  </div>
</header>

<div class="layout">
  <aside id="sidebar">
    <div class="sidebar-label">SOURCES</div>
    <button class="source-btn active" data-source="" onclick="filterSource(this,'')">
      All Feeds <span class="count" id="cnt-all">–</span>
    </button>
    {{range .Sources}}
    <button class="source-btn" data-source="{{.}}" onclick="filterSource(this,'{{.}}')">
      {{.}} <span class="count" id="cnt-{{.}}">–</span>
    </button>
    {{end}}
  </aside>

  <main>
    <div class="toolbar">
      <input id="search" type="text" placeholder="search titles & summaries…" oninput="applyFilters()">
      <span id="item-count"></span>
    </div>
    <div id="error-bar"></div>
    <div id="feed-list">
      <div class="state-msg"><div class="spinner"></div>Loading feeds…</div>
    </div>
  </main>
</div>

<script>
let allItems = [];
let activeSource = '';
let searchQ = '';

async function loadItems() {
  try {
    const r = await fetch('/api/items');
    const d = await r.json();
    allItems = d.items || [];

    // update last-updated
    if (d.lastUpdated) {
      const dt = new Date(d.lastUpdated);
      document.getElementById('last-updated').textContent =
        dt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + ' UTC';
    }

    // show errors
    const eb = document.getElementById('error-bar');
    const errKeys = Object.keys(d.errors||{});
    if (errKeys.length) {
      eb.style.display = 'block';
      eb.textContent = 'ERR: ' + errKeys.join(', ');
      errKeys.forEach(k => {
        const btn = document.querySelector('[data-source="'+k+'"]');
        if (btn) btn.classList.add('has-error');
      });
    } else { eb.style.display = 'none'; }

    // update counts
    document.getElementById('cnt-all').textContent = allItems.length;
    const sourceCounts = {};
    allItems.forEach(i => sourceCounts[i.source] = (sourceCounts[i.source]||0)+1);
    Object.entries(sourceCounts).forEach(([src, cnt]) => {
      const el = document.getElementById('cnt-'+src);
      if (el) el.textContent = cnt;
    });

    applyFilters();
  } catch(e) {
    document.getElementById('feed-list').innerHTML =
      '<div class="state-msg">Failed to load feeds.</div>';
  }
}

function applyFilters() {
  searchQ = document.getElementById('search').value.toLowerCase();
  const filtered = allItems.filter(it => {
    if (activeSource && it.source !== activeSource) return false;
    if (searchQ && !it.title.toLowerCase().includes(searchQ) &&
        !(it.summary||'').toLowerCase().includes(searchQ)) return false;
    return true;
  });
  renderItems(filtered);
}

function filterSource(btn, src) {
  activeSource = src;
  document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}

function renderItems(items) {
  const el = document.getElementById('feed-list');
  document.getElementById('item-count').textContent = items.length + ' items';
  if (!items.length) {
    el.innerHTML = '<div class="state-msg">No results found.</div>';
    return;
  }
  el.innerHTML = items.map(it => {
    const dateStr = it.published && it.published !== '0001-01-01T00:00:00Z'
      ? new Date(it.published).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'})
      : '';
    const summary = it.summary ? '<div class="item-summary">'+escHtml(it.summary)+'</div>' : '';
    return '<div class="feed-item">' +
      '<div class="item-meta">' +
        '<span class="item-source">'+escHtml(it.source)+'</span>' +
        '<span class="item-date">'+dateStr+'</span>' +
      '</div>' +
      '<div class="item-title"><a href="'+escHtml(it.link)+'" target="_blank" rel="noopener">'+escHtml(it.title)+'</a></div>' +
      summary +
    '</div>';
  }).join('');
}

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function triggerRefresh() {
  const btn = document.getElementById('refresh-btn');
  btn.textContent = '⟳ REFRESHING…';
  btn.disabled = true;
  try {
    await fetch('/api/refresh');
    await new Promise(r => setTimeout(r, 2000));
    await loadItems();
  } finally {
    btn.textContent = '⟳ REFRESH';
    btn.disabled = false;
  }
}

loadItems();
setInterval(loadItems, 60000);
</script>
</body>
</html>`
