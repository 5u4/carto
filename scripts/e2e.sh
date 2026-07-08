#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

carto() {
  pnpm exec carto "$@"
}

if ! carto --help >/dev/null 2>&1; then
  echo "e2e: carto binary not found; run 'pnpm build' first (or plan 003 is incomplete)" >&2
  exit 1
fi

carto sync
carto status
carto validate

tracked="packages/core/src/hash.ts"
backup="$(mktemp)"
cp "$tracked" "$backup"
restore() {
  if [ -f "$backup" ]; then
    cp "$backup" "$tracked"
    rm -f "$backup"
  fi
}
trap restore EXIT

printf '\n' >> "$tracked"
if carto status; then
  echo "e2e: expected stale status after mutating $tracked, got fresh" >&2
  exit 1
fi

carto sync
carto status

restore
carto sync
carto status

carto build

echo "e2e: pipeline green (sync -> status -> validate -> build) and staleness detected"
