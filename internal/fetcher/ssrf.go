package fetcher

import (
	"context"
	"fmt"
	"net"
	"net/url"
)

// privateRanges lists all CIDR blocks that must never be reachable via outbound
// feed fetches: loopback, RFC-1918 private, link-local, and IPv6 equivalents.
var privateRanges []*net.IPNet

func init() {
	for _, cidr := range []string{
		"0.0.0.0/8",        // "this" network
		"10.0.0.0/8",       // RFC-1918 class A
		"100.64.0.0/10",    // Shared address space (RFC 6598 / CGNAT)
		"127.0.0.0/8",      // IPv4 loopback
		"169.254.0.0/16",   // IPv4 link-local (AWS/GCP/Azure metadata endpoints)
		"172.16.0.0/12",    // RFC-1918 class B
		"192.0.2.0/24",     // TEST-NET-1 (RFC 5737)
		"192.168.0.0/16",   // RFC-1918 class C
		"198.51.100.0/24",  // TEST-NET-2 (RFC 5737)
		"203.0.113.0/24",   // TEST-NET-3 (RFC 5737)
		"240.0.0.0/4",      // Reserved (RFC 1112)
		"::1/128",          // IPv6 loopback
		"fc00::/7",         // IPv6 unique-local (ULA)
		"fe80::/10",        // IPv6 link-local
		"::ffff:0:0/96",    // IPv4-mapped IPv6 addresses
	} {
		_, block, err := net.ParseCIDR(cidr)
		if err == nil {
			privateRanges = append(privateRanges, block)
		}
	}
}

// isPrivateIP returns true when ip falls within any blocked address range.
func isPrivateIP(ip net.IP) bool {
	// Normalise to 16-byte form so IPv4-mapped IPv6 addresses compare correctly.
	ip = ip.To16()
	for _, block := range privateRanges {
		if block.Contains(ip) {
			return true
		}
	}
	return false
}

// ValidateFeedURL checks that rawURL is a well-formed http/https URL whose
// hostname resolves exclusively to public routable IP addresses.
// This prevents SSRF attacks at feed-add time.
func ValidateFeedURL(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("URL scheme must be http or https")
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("URL must include a host")
	}

	// Bare IP literal: no DNS lookup needed, check directly.
	if ip := net.ParseIP(host); ip != nil {
		if isPrivateIP(ip) {
			return fmt.Errorf("feed URL must not point to a private or reserved address")
		}
		return nil
	}

	// Hostname: resolve and verify every returned address.
	addrs, err := net.LookupHost(host)
	if err != nil {
		return fmt.Errorf("cannot resolve host %q: %w", host, err)
	}
	if len(addrs) == 0 {
		return fmt.Errorf("host %q resolved to no addresses", host)
	}
	for _, addr := range addrs {
		ip := net.ParseIP(addr)
		if ip == nil {
			continue
		}
		if isPrivateIP(ip) {
			return fmt.Errorf("feed URL must not point to a private or reserved address")
		}
	}
	return nil
}

// safeDialContext is used as the DialContext for the feed HTTP transport.
// It re-validates the resolved IP immediately before opening a TCP connection,
// blocking DNS-rebinding attacks where a hostname passes add-time validation
// but subsequently resolves to a private address.
func safeDialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, fmt.Errorf("ssrf: malformed address %q: %w", addr, err)
	}

	// At dial time the address should already be a resolved IP literal.
	ip := net.ParseIP(host)
	if ip != nil && isPrivateIP(ip) {
		return nil, fmt.Errorf("ssrf: connection to private address blocked (%s)", host)
	}

	d := &net.Dialer{}
	return d.DialContext(ctx, network, net.JoinHostPort(host, port))
}
