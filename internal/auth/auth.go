package auth

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"fmt"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// CookieName is the name of the HttpOnly session cookie.
const CookieName = "cyberfeed_session"

const sessionTTL = 24 * time.Hour

// Schema is the DDL for the auth tables. Applied at startup via InitSchema.
const Schema = `
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL,
    expires_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`

// InitSchema creates the auth tables if they do not already exist.
func InitSchema(db *sql.DB) error {
	_, err := db.Exec(Schema)
	return err
}

// UserCount returns the number of registered users.
func UserCount(db *sql.DB) (int, error) {
	var n int
	return n, db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n)
}

// CreateUser inserts a new user with a bcrypt-hashed password (cost 12).
// All values are passed as query parameters — no string interpolation.
func CreateUser(db *sql.DB, username, password string) error {
	if username == "" || password == "" {
		return fmt.Errorf("username and password must not be empty")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	_, err = db.Exec(
		`INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)`,
		username, string(hash), time.Now().UTC().Format(time.RFC3339),
	)
	return err
}

// UpdatePassword replaces the bcrypt hash for an existing user.
// Returns sql.ErrNoRows if the username does not exist.
func UpdatePassword(db *sql.DB, username, password string) error {
	if username == "" || password == "" {
		return fmt.Errorf("username and password must not be empty")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	res, err := db.Exec(
		`UPDATE users SET password_hash = ? WHERE username = ?`,
		string(hash), username,
	)
	if err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// Login validates credentials against the database and returns a new session
// token on success. All queries use parameterised statements.
//
// The same opaque error is returned for "user not found" and "wrong password"
// to prevent user-enumeration. bcrypt is run in both paths to keep response
// time constant (timing oracle mitigation).
func Login(db *sql.DB, username, password string) (string, error) {
	var userID int64
	var hash string

	err := db.QueryRow(
		`SELECT id, password_hash FROM users WHERE username = ?`,
		username,
	).Scan(&userID, &hash)

	if err == sql.ErrNoRows {
		// Dummy comparison keeps response time constant.
		_ = bcrypt.CompareHashAndPassword(
			[]byte("$2a$12$aaaaaaaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
			[]byte(password),
		)
		return "", fmt.Errorf("invalid credentials")
	}
	if err != nil {
		return "", fmt.Errorf("lookup user: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return "", fmt.Errorf("invalid credentials")
	}

	token, err := newToken()
	if err != nil {
		return "", err
	}

	now := time.Now().UTC()
	_, err = db.Exec(
		`INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
		token, userID,
		now.Format(time.RFC3339),
		now.Add(sessionTTL).Format(time.RFC3339),
	)
	if err != nil {
		return "", fmt.Errorf("create session: %w", err)
	}
	return token, nil
}

// ValidateSession returns the username for a valid, non-expired session token.
// Uses a parameterised JOIN query — no string interpolation.
func ValidateSession(db *sql.DB, token string) (string, error) {
	if token == "" {
		return "", fmt.Errorf("missing session token")
	}
	var username, expiresAt string
	err := db.QueryRow(`
		SELECT u.username, s.expires_at
		FROM   sessions s
		JOIN   users    u ON u.id = s.user_id
		WHERE  s.id = ?
	`, token).Scan(&username, &expiresAt)

	if err == sql.ErrNoRows {
		return "", fmt.Errorf("invalid session")
	}
	if err != nil {
		return "", fmt.Errorf("query session: %w", err)
	}

	exp, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil || time.Now().UTC().After(exp) {
		return "", fmt.Errorf("session expired")
	}
	return username, nil
}

// Logout deletes the session record for the given token.
func Logout(db *sql.DB, token string) error {
	if token == "" {
		return nil
	}
	_, err := db.Exec(`DELETE FROM sessions WHERE id = ?`, token)
	return err
}

// PruneSessions removes all expired sessions. Safe to call on a background ticker.
func PruneSessions(db *sql.DB) error {
	_, err := db.Exec(
		`DELETE FROM sessions WHERE expires_at < ?`,
		time.Now().UTC().Format(time.RFC3339),
	)
	return err
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	return base64.URLEncoding.EncodeToString(b), nil
}
