#!/usr/bin/env bash
# build.sh — Build the CyberFeed single binary
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$ROOT/cmd/server/web"
DIST_DIR="$WEB_DIR/dist"

echo "==> Building React frontend..."
cd "$WEB_DIR"
npm install
npm run build

echo "==> Verifying dist output..."
if [ ! -f "$DIST_DIR/index.html" ]; then
  echo "ERROR: dist/index.html not found after build"
  exit 1
fi

echo "==> Building Go binary..."
cd "$ROOT"
go build -o cyberfeed ./cmd/server

echo ""
echo "✓ Done. Run: ./cyberfeed"
echo "  Then open: http://localhost:8888"
