#!/bin/bash
set -euo pipefail

SRC="/home/admin/cyberfeed/graphify-out"
DST="/home/admin/cyberfeed-graph"

# 1. Clear destination
echo "Clearing $DST..."
rm -rf "${DST:?}"/{*,.[!.]*} 2>/dev/null || true

# 2. Move graphify-out contents to destination
echo "Moving $SRC to $DST..."
mv "$SRC"/* "$SRC"/.[!.]* "$DST/" 2>/dev/null || true

# 3. Remove the now-empty source directory
echo "Removing $SRC..."
rm -rf "$SRC"

# 4. Push to GitHub
#echo "Pushing to GitHub..."
#cd "$DST"
#git add -A
#git commit -m "chore: update graphify knowledge graph"
#git push origin main

echo "Done."
