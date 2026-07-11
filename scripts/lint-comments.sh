#!/bin/sh
set -eu

hits=""

while IFS= read -r file; do
  [ -n "$file" ] || continue
  case "$file" in
    *.ts|*.mjs|*.js) ;;
    *) continue ;;
  esac
  stripped=$(sed -e 's#/\*\* @type {.*} \*/##g' -e 's#/\* @vite-ignore \*/##g' "$file" 2>/dev/null)
  file_hits=$(printf '%s\n' "$stripped" | grep -nE '(^|[^:])//|/\*|\*/' | grep -v 'SPDX-License-Identifier' | awk -v f="$file" '{ print f ":" $0 }' || true)
  if [ -n "$file_hits" ]; then
    hits="${hits}${file_hits}
"
  fi
done <<EOF
$(git ls-files -- packages scripts)
EOF

if [ -n "$hits" ]; then
  echo "lint-comments: disallowed comments found (see AGENTS.md 'No comments in code'):" >&2
  printf '%s' "$hits" >&2
  exit 1
fi

exit 0
