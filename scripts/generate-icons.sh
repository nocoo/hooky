#!/bin/bash
#
# Generate all icon sizes from hooky-max.png (900x900 source).
# Uses macOS built-in `sips` — no external dependencies required.
#
# Sizes:
#   Extension icons (manifest): 16, 32(2x), 48, 96(2x), 128, 256(2x)
#   Favicon:                    32, 64(2x)
#   Inline page logo:           24, 48(2x)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$ROOT_DIR/hooky-max.png"
ICON_DIR="$ROOT_DIR/src/icons"

if [ ! -f "$SOURCE" ]; then
  echo "ERROR: Source file not found: $SOURCE"
  exit 1
fi

# All unique sizes needed (sorted, deduplicated)
SIZES=(16 24 32 48 64 96 128 256)

echo "Source: $SOURCE ($(sips -g pixelWidth "$SOURCE" 2>/dev/null | tail -1 | awk '{print $2}')px)"
echo "Output: $ICON_DIR"
echo ""

# Remove old generated PNGs (keep icon.svg)
find "$ICON_DIR" -name '*.png' -delete 2>/dev/null || true

for size in "${SIZES[@]}"; do
  output="$ICON_DIR/icon${size}.png"
  cp "$SOURCE" "$output"
  sips -z "$size" "$size" "$output" --out "$output" > /dev/null 2>&1
  echo "  ✓ icon${size}.png  (${size}x${size})"
done

echo ""
echo "Done! Generated ${#SIZES[@]} icons."
