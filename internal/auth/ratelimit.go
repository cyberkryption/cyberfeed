package auth

import (
	"net"
	"net/http"
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

// ClientIP extracts the remote IP address from a request, stripping the port.
// It does not trust X-Forwarded-For to avoid spoofing when no trusted proxy
// sits in front of the server.
func ClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
