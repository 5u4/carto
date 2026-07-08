#!/bin/sh
set -eu

files=$(git ls-files -- packages scripts | grep -E '\.(ts|mjs|js)$' || true)

if [ -z "$files" ]; then
  exit 0
fi

hits=$(printf '%s\n' $files | xargs grep -nHE '(^|[^:])//|/\*|\*/' 2>/dev/null | grep -v 'SPDX-License-Identifier' || true)

if [ -n "$hits" ]; then
  echo "lint-comments: disallowed comments found (see AGENTS.md 'No comments in code'):" >&2
  echo "$hits" >&2
  exit 1
fi

exit 0
