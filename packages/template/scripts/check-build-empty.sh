#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
package_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)

fixture_root=${CARTO_ROOT:-}
if [ -z "$fixture_root" ]; then
  echo "check-build-empty: CARTO_ROOT must be set" >&2
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
zh_home_html="$site_dir/zh/index.html"

for f in "$home_html" "$zh_home_html"; do
  if [ ! -f "$f" ]; then
    echo "check-build-empty: missing expected output: $f" >&2
    exit 1
  fi
done

if grep -q 'http-equiv="refresh"' "$home_html"; then
  echo "check-build-empty: homepage $home_html is a redirect, expected a real empty-state page" >&2
  exit 1
fi

if ! grep -q '/carto' "$home_html"; then
  echo "check-build-empty: empty-state guidance not found in $home_html" >&2
  exit 1
fi

echo "check-build-empty: ok"
