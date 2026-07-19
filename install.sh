#!/usr/bin/env bash
set -euo pipefail

: "${HOME:?HOME is not set; cannot determine install paths}"
REPO_URL="${CARTO_REPO_URL:-https://github.com/5u4/carto.git}"
CARTO_HOME="${CARTO_DIR:-$HOME/.carto}"
REPO_DIR="$CARTO_HOME/repo"
SKILLS_DIR="$HOME/.agents/skills"
SKILL_NAMES=(carto documenting-component)

say() { printf '%s\n' "$*"; }
step() { printf '\n\033[1m→ %s\033[0m\n' "$*"; }
die() { printf 'carto install: %s\n' "$*" >&2; exit 1; }

require() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not found on PATH. Install it and re-run."
}

clone_or_update() {
  if [ -d "$REPO_DIR" ] && [ ! -d "$REPO_DIR/.git" ]; then
    die "$REPO_DIR exists but is not a git checkout; remove it and re-run: rm -rf \"$REPO_DIR\""
  fi
  if [ -d "$REPO_DIR/.git" ]; then
    step "Updating $REPO_DIR"
    git -C "$REPO_DIR" pull --ff-only
  else
    step "Cloning $REPO_URL"
    mkdir -p "$(dirname "$REPO_DIR")"
    git clone --depth 1 "$REPO_URL" "$REPO_DIR"
  fi
}

build_cli() {
  step "Building carto CLI"
  ( cd "$REPO_DIR" && pnpm install && pnpm -r build )
}

link_cli() {
  step "Linking carto onto PATH via pnpm"
  ( cd "$REPO_DIR/packages/cli" && pnpm link --global )
}

link_skill() {
  mkdir -p "$SKILLS_DIR"
  for name in "${SKILL_NAMES[@]}"; do
    link="$SKILLS_DIR/$name"
    step "Linking $name skill → $link"
    if [ -e "$link" ] && [ ! -L "$link" ]; then
      die "$link already exists and is not a symlink; move it aside and re-run."
    fi
    ln -sfn "$REPO_DIR/skills/$name" "$link"
  done
}

do_install() {
  require git
  require node
  require pnpm
  clone_or_update
  build_cli
  link_cli
  link_skill
  printf '\n\033[1;32m✓ carto CLI installed.\033[0m\n'
  say "  Open a new shell (or source your shell rc), then verify: carto --help"
  say ""
  say "  To load the carto skill into your coding agent, run:"
  say "    npx skills add 5u4/carto"
}

do_update() {
  require git
  require pnpm
  [ -d "$REPO_DIR/.git" ] || die "no install found at $REPO_DIR; run install first."
  clone_or_update
  build_cli
  link_skill
  say "✓ carto updated."
}

do_uninstall() {
  for name in "${SKILL_NAMES[@]}"; do
    link="$SKILLS_DIR/$name"
    if [ -L "$link" ]; then
      rm -f "$link"
      say "removed $link"
    fi
  done
  if pnpm uninstall --global @carto/cli >/dev/null 2>&1; then
    say "unlinked carto from pnpm global"
  fi
  say "kept the checkout at $REPO_DIR — remove it with: rm -rf \"$REPO_DIR\""
}

usage() {
  cat <<USAGE
carto installer

Usage:
  install.sh                 Install the carto CLI and link its skill
  install.sh --update        Pull latest and rebuild
  install.sh --uninstall     Unlink the CLI and skill
  install.sh --help

Environment:
  CARTO_REPO_URL   Override clone URL (default: https://github.com/5u4/carto.git)
  CARTO_DIR        Override install root (default: \$HOME/.carto)
USAGE
}

main() {
  case "${1:-}" in
    ""|install) do_install ;;
    --update|update) do_update ;;
    --uninstall|uninstall) do_uninstall ;;
    -h|--help|help) usage ;;
    *) usage; exit 1 ;;
  esac
}

main "${1:-}"
