#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
package_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)

fixture_root=${CARTO_ROOT:-}
if [ -z "$fixture_root" ]; then
  echo "check-build: CARTO_ROOT must be set" >&2
  exit 1
fi

case "$fixture_root" in
  /*) ;;
  *) fixture_root="$(pwd)/$fixture_root" ;;
esac

cd "$package_dir"
CARTO_ROOT="$fixture_root" node ./dist/materialize.js
CARTO_ROOT="$fixture_root" "$package_dir/node_modules/.bin/astro" build

site_dir="$fixture_root/dist-site"
home_html="$site_dir/index.html"
overview_html="$site_dir/overview/index.html"
billing_en_html="$site_dir/backend/billing/index.html"
billing_zh_html="$site_dir/zh/backend/billing/index.html"

for f in "$home_html" "$overview_html" "$billing_en_html" "$billing_zh_html"; do
  if [ ! -f "$f" ]; then
    echo "check-build: missing expected output: $f" >&2
    exit 1
  fi
done

if ! grep -q '/overview/' "$home_html"; then
  echo "check-build: homepage $home_html does not redirect to /overview/" >&2
  exit 1
fi

if grep -q 'carto:' "$overview_html"; then
  echo "check-build: unresolved carto: link found in $overview_html" >&2
  exit 1
fi

if ! grep -q '/backend/billing/' "$overview_html"; then
  echo "check-build: expected resolved /backend/billing/ href not found in $overview_html" >&2
  exit 1
fi

echo "check-build: ok"
