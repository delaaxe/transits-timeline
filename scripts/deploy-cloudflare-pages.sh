#!/usr/bin/env bash
set -euo pipefail

# Builds, then publishes with the active wrangler login. Run `npx wrangler login`
# once first.
#
#   ./scripts/deploy-cloudflare-pages.sh            -> production
#   ./scripts/deploy-cloudflare-pages.sh preview    -> preview URL, production untouched

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# main is the project's production branch; anything else is a preview.
branch="${1:-main}"

[[ -f api-key.js ]] || { echo "api-key.js is missing; the build would ship a placeholder." >&2; exit 1; }

npm run build

# dist/ is rebuilt from scratch by the build, so only built output can ship.
# This is what replaced deploying the working directory, which once published .env.
expected=(index.html aspects.json myths.json apple-touch-icon.png)
for f in "${expected[@]}"; do
  [[ -f "dist/$f" ]] || { echo "Build did not produce dist/$f" >&2; exit 1; }
done
# One page bundle, one worker, and the chunk they share.
for kind in app worker chunk; do
  n="$(find dist -maxdepth 1 -name "$kind.*.js" | wc -l | tr -d ' ')"
  [[ "$n" == "1" ]] || { echo "Expected exactly one $kind.*.js in dist/, found $n" >&2; exit 1; }
done

stray="$(find dist -type f \! -name 'app.*.js' \! -name 'worker.*.js' \! -name 'chunk.*.js' $(printf '! -name %s ' "${expected[@]}"))"
if [[ -n "$stray" ]]; then
  echo "Unexpected files in dist/:" >&2; echo "$stray" >&2; exit 1
fi

if [[ "$branch" == "main" ]]; then
  echo "Deploying to PRODUCTION (transits-timeline.pages.dev)." >&2
else
  echo "Deploying preview branch '$branch'; production is untouched." >&2
fi

npx wrangler pages deploy dist --project-name "transits-timeline" --branch "$branch"
