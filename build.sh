#!/usr/bin/env bash
# build.sh — Build the CyberFeed single binary
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$ROOT/cmd/server/web"
DIST_DIR="$WEB_DIR/dist"

# ─── Prerequisite checks ─────────────────────────────────────────────────────

echo "==> Checking prerequisites..."

# Go
if ! command -v go &>/dev/null; then
  echo "ERROR: Go is not installed or not on PATH."
  echo "       Install from https://go.dev/dl/ and re-run."
  exit 1
fi
echo "  [OK] Go found: $(go version)"

# Node.js (18+)
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is not installed or not on PATH."
  echo "       Install from https://nodejs.org/ and re-run."
  exit 1
fi
NODE_VER="$(node --version)"           # e.g. v20.11.0
NODE_MAJOR="${NODE_VER#v}"             # strip leading v
NODE_MAJOR="${NODE_MAJOR%%.*}"         # keep major only
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERROR: Node.js $NODE_VER is too old. Version 18 or later is required."
  echo "       Install a newer version from https://nodejs.org/"
  exit 1
fi
echo "  [OK] Node.js found: $NODE_VER"

# npm
if ! command -v npm &>/dev/null; then
  echo "ERROR: npm is not installed or not on PATH."
  exit 1
fi
echo "  [OK] npm found: $(npm --version)"

# ─── React frontend ──────────────────────────────────────────────────────────

echo ""
echo "==> Building React frontend..."
cd "$WEB_DIR"
npm install --prefer-offline

echo ""
echo "==> Running npm audit..."
if ! npm audit; then
  echo "  [!!] npm audit found vulnerabilities — continuing build."
  echo "       Run: cd \"$WEB_DIR\" && npm audit fix"
  echo ""
fi

echo ""
echo "==> Building frontend bundle..."
npm run build

echo "==> Verifying dist output..."
if [ ! -f "$DIST_DIR/index.html" ]; then
  echo "ERROR: dist/index.html not found after build"
  exit 1
fi

# ─── Go binary ───────────────────────────────────────────────────────────────

echo ""
echo "==> Building Go binary..."
cd "$ROOT"
CGO_ENABLED=0 go build -ldflags="-s -w" -trimpath -o cyberfeed ./cmd/server

echo ""
echo "✓ Done. Run: ./cyberfeed"
echo "  Then open: http://localhost:8888"
