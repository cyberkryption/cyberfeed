package auth

import (
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	maxFailures     = 5
	failureWindow   = time.Minute
	lockoutDuration = 15 * time.Minute
)

type ipEntry struct {
	failures    int
	windowStart time.Time
	lockedUntil time.Time
}

// LoginLimiter is a thread-safe, in-memory per-IP brute-force guard.
// After maxFailures failed logins within failureWindow the IP is locked
// out for lockoutDuration. A successful login resets the counter.
type LoginLimiter struct {
	mu    sync.Mutex
	state map[string]*ipEntry
}

// NewLoginLimiter returns a ready-to-use LoginLimiter.
func NewLoginLimiter() *LoginLimiter {
	return &LoginLimiter{state: make(map[string]*ipEntry)}
}

// Allow returns (true, 0) when the IP may attempt a login.
// Returns (false, retryAfter) when the IP is locked out.
func (l *LoginLimiter) Allow(ip string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	e := l.entry(ip)
	if now := time.Now(); now.Before(e.lockedUntil) {
		return false, e.lockedUntil.Sub(now)
	}
	return true, 0
}

// RecordFailure increments the failure counter; locks the IP out when
// the threshold is reached within the sliding window.
func (l *LoginLimiter) RecordFailure(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	e := l.entry(ip)
	now := time.Now()

	// Reset counter if the window has expired.
	if now.Sub(e.windowStart) > failureWindow {
		e.failures = 0
		e.windowStart = now
	}
	e.failures++
	if e.failures >= maxFailures {
		e.lockedUntil = now.Add(lockoutDuration)
	}
}

// RecordSuccess clears the failure state for an IP after a successful login.
func (l *LoginLimiter) RecordSuccess(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.state, ip)
}

// PruneStale removes entries whose lockout and failure window have both
// expired. Safe to call on a background ticker to bound memory usage.
func (l *LoginLimiter) PruneStale() {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	for ip, e := range l.state {
		if now.After(e.lockedUntil) && now.Sub(e.windowStart) > failureWindow {
			delete(l.state, ip)
		}
	}
}

func (l *LoginLimiter) entry(ip string) *ipEntry {
	e, ok := l.state[ip]
	if !ok {
		e = &ipEntry{windowStart: time.Now()}
		l.state[ip] = e
	}
	return e
}

// ParseTrustedProxies parses a slice of CIDR strings into *net.IPNet values.
// Returns an error if any CIDR is malformed.
func ParseTrustedProxies(cidrs []string) ([]*net.IPNet, error) {
	out := make([]*net.IPNet, 0, len(cidrs))
	for _, cidr := range cidrs {
		_, block, err := net.ParseCIDR(cidr)
		if err != nil {
			return nil, fmt.Errorf("invalid trusted proxy CIDR %q: %w", cidr, err)
		}
		out = append(out, block)
	}
	return out, nil
}

// ClientIP returns the real client IP address. When trusted is non-empty and
// the direct connection comes from one of those CIDRs, the leftmost publicly
// routable IP in X-Forwarded-For is used instead of r.RemoteAddr, preventing
// the rate limiter from collapsing all clients to the proxy's address.
//
// When no trusted proxies are configured, r.RemoteAddr is always used to
// prevent X-Forwarded-For spoofing by untrusted clients.
func ClientIP(r *http.Request, trusted []*net.IPNet) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}

	if len(trusted) == 0 {
		return host
	}

	remoteIP := net.ParseIP(host)
	if remoteIP == nil || !inCIDRList(remoteIP, trusted) {
		return host
	}

	// Connection is from a trusted proxy — read X-Forwarded-For and return
	// the leftmost non-private IP (the actual client address).
	xff := r.Header.Get("X-Forwarded-For")
	for _, part := range strings.Split(xff, ",") {
		ip := net.ParseIP(strings.TrimSpace(part))
		if ip != nil && !isRFC1918OrLoopback(ip) {
			return ip.String()
		}
	}

	return host
}

func inCIDRList(ip net.IP, cidrs []*net.IPNet) bool {
	for _, cidr := range cidrs {
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}

// isRFC1918OrLoopback reports whether ip is a private or loopback address.
// Used to skip non-routable addresses in the X-Forwarded-For chain.
var privateBlocks []*net.IPNet

func init() {
	for _, cidr := range []string{
		"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
		"127.0.0.0/8", "169.254.0.0/16",
		"::1/128", "fc00::/7", "fe80::/10",
	} {
		_, block, err := net.ParseCIDR(cidr)
		if err == nil {
			privateBlocks = append(privateBlocks, block)
		}
	}
}

func isRFC1918OrLoopback(ip net.IP) bool {
	ip = ip.To16()
	for _, block := range privateBlocks {
		if block.Contains(ip) {
			return true
		}
	}
	return false
}
