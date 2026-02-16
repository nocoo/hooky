#!/bin/bash
#
# Package the extension into a ZIP file for Chrome Web Store submission.
#
# Output: dist/hooky-<version>.zip
#
# Only includes runtime files required by the extension:
#   manifest.json, _locales/, src/
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"

# Read version from manifest.json
VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ROOT_DIR/manifest.json','utf8')).version)")
OUTFILE="$DIST_DIR/hooky-${VERSION}.zip"

echo "📦 Packaging Hooky v${VERSION}"
echo ""

# Clean previous build
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Create ZIP with only runtime files
cd "$ROOT_DIR"
zip -r "$OUTFILE" \
  manifest.json \
  _locales/ \
  src/ \
  -x "src/icons/icon.svg" \
  > /dev/null

# Report
SIZE=$(du -h "$OUTFILE" | cut -f1 | xargs)
echo "  ✅ $OUTFILE ($SIZE)"
echo ""
echo "Done! Upload this file to the Chrome Web Store Developer Dashboard."
