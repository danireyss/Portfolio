#!/usr/bin/env bash
# Request latency with hyperfine, for before/after comparisons when tuning:
#   local  the API as a release build on localhost (no network), one request per endpoint
#   prod   the live site through CloudFront: edge-cached responses, and cache-busted API requests
#          that reach API Gateway and Lambda
#
# Each run times a whole `curl` process, so `health` is the fixed overhead to compare against.
# Results (Markdown + JSON) go to bench/results/<timestamp>/.
#
#   scripts/bench.sh          # local and prod
#   scripts/bench.sh local    # local only
#   scripts/bench.sh prod     # prod only
set -euo pipefail
cd "$(dirname "$0")/.."

command -v hyperfine >/dev/null || { echo "hyperfine not found; install it with: brew install hyperfine" >&2; exit 1; }

mode=${1:-all}
out="bench/results/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$out"

if [[ $mode == all || $mode == local ]]; then
  port=3997
  api="http://127.0.0.1:$port/api"
  (cd backend && cargo build --release --quiet)
  # Same log level as production, so per-request debug logging doesn't skew the numbers.
  RUST_LOG=info PORT=$port PHOTOS_DIR=frontend/public/photos \
    backend/target/release/portfolio-api > "$out/local-server.log" 2>&1 &
  server=$!
  trap 'kill $server 2>/dev/null' EXIT
  curl -s --retry 20 --retry-connrefused --retry-delay 1 -o /dev/null "$api/health"

  hyperfine -N --warmup 20 --runs 300 \
    --export-markdown "$out/local.md" --export-json "$out/local.json" \
    -n health "curl -s -o /dev/null $api/health" \
    -n site "curl -s -o /dev/null $api/site" \
    -n projects "curl -s -o /dev/null $api/projects" \
    -n project "curl -s -o /dev/null $api/projects/this-website" \
    -n resume "curl -s -o /dev/null $api/resume" \
    -n resume.pdf "curl -s -o /dev/null $api/resume.pdf" \
    -n photos "curl -s -o /dev/null $api/photos"
fi

if [[ $mode == all || $mode == prod ]]; then
  site=https://danireyss.dev

  # Answered by the CloudFront edge (warmup fills the cache).
  hyperfine -N --warmup 3 --runs 30 \
    --export-markdown "$out/prod-edge.md" --export-json "$out/prod-edge.json" \
    -n 'home (edge)' "curl -s -o /dev/null $site/" \
    -n 'site API (edge)' "curl -s -o /dev/null $site/api/site"

  # A random query string misses the cache, so every run reaches API Gateway and Lambda. The pause
  # (not timed) keeps under the API's 10 requests/second throttle.
  hyperfine --shell=bash --prepare 'sleep 0.2' --warmup 2 --runs 20 \
    --export-markdown "$out/prod-lambda.md" --export-json "$out/prod-lambda.json" \
    -n 'health (Lambda)' "curl -s -o /dev/null '$site/api/health?bench=\$RANDOM'" \
    -n 'site API (Lambda)' "curl -s -o /dev/null '$site/api/site?bench=\$RANDOM'" \
    -n 'photos API (Lambda, S3 list)' "curl -s -o /dev/null '$site/api/photos?bench=\$RANDOM'"
fi

echo
echo "Results in $out/"
