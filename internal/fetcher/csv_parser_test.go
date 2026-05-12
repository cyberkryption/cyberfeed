package fetcher

import (
	"testing"
)

func TestParseCSV_IPC2s(t *testing.T) {
	data := []byte("#ip,ioc\n1.13.247.208,Possible Cobaltstrike C2 IP\n1.15.100.187,Possible Cobaltstrike C2 IP")
	items, err := ParseCSV("C2 IPs", "https://example.com/IPC2s.csv", data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("want 2 items, got %d", len(items))
	}
	if items[0].Title != "1.13.247.208" {
		t.Errorf("title = %q, want %q", items[0].Title, "1.13.247.208")
	}
	if items[0].Categories[0] != "C2" || items[0].Categories[1] != "IP" {
		t.Errorf("categories = %v", items[0].Categories)
	}
	if items[0].Link != "https://www.virustotal.com/gui/ip-address/1.13.247.208" {
		t.Errorf("link = %q", items[0].Link)
	}
}

func TestParseCSV_IPPortC2s(t *testing.T) {
	data := []byte("#ip,port,ioc\n1.13.247.208,80,Possible Cobaltstrike C2 IP")
	items, err := ParseCSV("C2 IP:Port", "https://example.com/IPPortC2s.csv", data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("want 1 item, got %d", len(items))
	}
	if items[0].Title != "1.13.247.208:80" {
		t.Errorf("title = %q", items[0].Title)
	}
	want := []string{"C2", "IP", "Port"}
	for i, c := range want {
		if items[0].Categories[i] != c {
			t.Errorf("category[%d] = %q, want %q", i, items[0].Categories[i], c)
		}
	}
}

func TestParseCSV_DNSC2Domains(t *testing.T) {
	data := []byte("#domain,ioc,IPs,C2Domains\n\"0o0.foo\",\"Possible Cobaltstrike DNS C2\",\"47.129.171.26\",\"ns.1.0o0.foo\"")
	items, err := ParseCSV("C2 DNS", "https://example.com/DNSC2Domains.csv", data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("want 1 item, got %d", len(items))
	}
	if items[0].Title != "0o0.foo" {
		t.Errorf("title = %q", items[0].Title)
	}
	if items[0].Categories[1] != "DNS" {
		t.Errorf("expected DNS category, got %v", items[0].Categories)
	}
}

func TestParseCSV_DomainWithURLAndIP(t *testing.T) {
	data := []byte("#domain,ioc,uri_path,ip\nexample.com,Possible C2,/api/x,1.2.3.4")
	items, err := ParseCSV("C2 URL+IP", "https://example.com/domainC2swithURLwithIP.csv", data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("want 1 item, got %d", len(items))
	}
	if items[0].Title != "example.com/api/x" {
		t.Errorf("title = %q", items[0].Title)
	}
	if items[0].Categories[2] != "URL" {
		t.Errorf("categories = %v", items[0].Categories)
	}
}

func TestParseCSV_EmptyFile(t *testing.T) {
	items, err := ParseCSV("C2", "https://example.com/foo.csv", []byte("#ip,ioc"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 0 {
		t.Errorf("want 0 items, got %d", len(items))
	}
}

func TestIsCSVURL(t *testing.T) {
	cases := []struct {
		url  string
		want bool
	}{
		{"https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/IPC2s.csv", true},
		{"https://example.com/feed.xml", false},
		{"https://example.com/FEED.CSV", true},
		{"https://example.com/feed.csv?v=1", true},
	}
	for _, c := range cases {
		if got := isCSVURL(c.url); got != c.want {
			t.Errorf("isCSVURL(%q) = %v, want %v", c.url, got, c.want)
		}
	}
}
