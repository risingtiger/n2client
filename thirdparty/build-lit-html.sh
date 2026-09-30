#!/bin/sh
set -eu

# Build a browser-ready ES module containing only lit-html's public
# `html` and `render` exports (plus the internal code they require).
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUTPUT="$SCRIPT_DIR/lit-html.js"
WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/lit-html-build.XXXXXX")

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT HUP INT TERM

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required but was not found." >&2
  exit 1
fi

cd "$WORK_DIR"
printf '{"private":true}\n' > package.json

printf '%s\n' 'Downloading the latest lit-html and esbuild...'
npm install --silent --no-audit --no-fund lit-html@latest esbuild@latest

cat > entry.js <<'EOF'
export { html, render } from 'lit-html';
EOF

./node_modules/.bin/esbuild entry.js \
  --bundle \
  --format=esm \
  --platform=browser \
  --tree-shaking=true \
  --minify \
  --legal-comments=none \
  --outfile=lit-html.js

mv lit-html.js "$OUTPUT"
VERSION=$(node -p "require('./node_modules/lit-html/package.json').version")
SIZE=$(wc -c < "$OUTPUT" | tr -d ' ')
printf 'Built %s using lit-html %s (%s bytes).\n' "$OUTPUT" "$VERSION" "$SIZE"
