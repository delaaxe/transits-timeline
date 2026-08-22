#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ -f ".env" ]]; then
  set -a
  source ".env"
  set +a
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Set CLOUDFLARE_API_TOKEN in .env." >&2
  exit 1
fi

# Only these files are published. Everything else (.env, .git, .wrangler,
# scripts/, *.example.*, .DS_Store, ...) stays local.
assets=(
  index.html
  api-key.js
  aspects.json
  myths.json
  apple-touch-icon.png
)

staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

for asset in "${assets[@]}"; do
  if [[ ! -f "$asset" ]]; then
    echo "Missing required asset: $asset" >&2
    exit 1
  fi
  cp "$asset" "$staging/"
done

wrangler pages deploy "$staging" --project-name "transits-timeline" --branch "main"
