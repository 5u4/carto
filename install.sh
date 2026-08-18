#!/usr/bin/env bash
set -euo pipefail

: "${HOME:?HOME is not set; cannot determine install paths}"
REPO_URL="${CARTO_REPO_URL:-https://github.com/5u4/carto.git}"
CARTO_HOME="${CARTO_DIR:-$HOME/.carto}"
case "$CARTO_HOME" in
  /*) ;;
  *) CARTO_HOME="$PWD/$CARTO_HOME" ;;
esac
REPO_DIR="$CARTO_HOME/repo"
BIN_DIR="$HOME/.local/bin"
CLI_LINK="$BIN_DIR/carto"
CLI_TARGET="$REPO_DIR/packages/cli/dist/index.js"
SKILLS_DIR="$HOME/.agents/skills"
SKILL_NAMES=(carto)
MARKER_FILE="$CARTO_HOME/.installer-owner"
PATH_RC_FILE="$CARTO_HOME/.path-rc"
PATH_BACKUP_FILE="$CARTO_HOME/.path-rc.before"
PATH_INSTALLED_FILE="$CARTO_HOME/.path-rc.after"
PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
MARKER_VALUE='carto-installer-v1'
PNPM=()

if [ -t 1 ]; then
  BOLD=$'\033[1m'
  GREEN=$'\033[1;32m'
  RESET=$'\033[0m'
else
  BOLD=''
  GREEN=''
  RESET=''
  export NO_COLOR=1
fi

say() { printf '%s\n' "$*"; }
step() { printf '\n%s→ %s%s\n' "$BOLD" "$*" "$RESET"; }
die() { printf 'carto install: %s\n' "$*" >&2; exit 1; }

require() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not found on PATH. Install it and re-run."
}
configure_package_manager() {
  local major version
  if command -v corepack >/dev/null 2>&1; then
    PNPM=(corepack pnpm)
    return
  fi
  command -v pnpm >/dev/null 2>&1 || die "Corepack or pnpm 10 is required but neither was found on PATH."
  version="$(pnpm --version)"
  major="${version%%.*}"
  [ "$major" -ge 10 ] 2>/dev/null || die "pnpm >=10 is required; found $version. Install pnpm 10 or Corepack and re-run."
  PNPM=(pnpm)
}


check_node_version() {
  local version
  version="$(node -p 'process.versions.node')"
  node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)' || die "Node >=22.12.0 is required; found $version."
}

validate_checkout() {
  local branch origin status
  [ -d "$REPO_DIR/.git" ] || die "$REPO_DIR exists but is not a git checkout."
  origin="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"
  [ "$origin" = "$REPO_URL" ] || die "$REPO_DIR belongs to a different remote ($origin); expected $REPO_URL."
  branch="$(git -C "$REPO_DIR" symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
  [ "$branch" = main ] || die "$REPO_DIR must be on main; found ${branch:-a detached HEAD}."
  status="$(git -C "$REPO_DIR" status --porcelain --untracked-files=normal)" || die "$REPO_DIR is not a readable git checkout."
  [ -z "$status" ] || die "$REPO_DIR has local changes; commit or remove them before updating."
}

prepare_install_root() {
  local entries
  if [ -L "$CARTO_HOME" ] || { [ -e "$CARTO_HOME" ] && [ ! -d "$CARTO_HOME" ]; }; then
    die "$CARTO_HOME exists and is not a directory."
  fi
  if [ -e "$MARKER_FILE" ] || [ -L "$MARKER_FILE" ]; then
    [ -f "$MARKER_FILE" ] && [ ! -L "$MARKER_FILE" ] && [ "$(cat "$MARKER_FILE")" = "$MARKER_VALUE" ] || die "$MARKER_FILE is not owned by the carto installer."
    return
  fi
  if [ -d "$CARTO_HOME" ]; then
    shopt -s nullglob dotglob
    entries=("$CARTO_HOME"/*)
    shopt -u nullglob dotglob
    if [ "${#entries[@]}" -gt 0 ]; then
      if [ "${#entries[@]}" -ne 1 ] || [ "${entries[0]}" != "$REPO_DIR" ]; then
        die "$CARTO_HOME contains files not owned by the carto installer; choose a different CARTO_DIR."
      fi
      validate_checkout
    fi
  fi
  mkdir -p "$CARTO_HOME"
  printf '%s\n' "$MARKER_VALUE" > "$MARKER_FILE"
}

clone_or_update() {
  if [ -d "$REPO_DIR/.git" ]; then
    validate_checkout
    step "Updating $REPO_DIR"
    git -C "$REPO_DIR" fetch origin main:refs/remotes/origin/main
    git -C "$REPO_DIR" merge-base --is-ancestor HEAD refs/remotes/origin/main || die "$REPO_DIR contains local commits or has diverged from origin/main."
    git -C "$REPO_DIR" merge --ff-only refs/remotes/origin/main
  elif [ -e "$REPO_DIR" ]; then
    die "$REPO_DIR exists but is not a git checkout."
  else
    step "Cloning $REPO_URL"
    git clone --depth 1 --branch main --single-branch "$REPO_URL" "$REPO_DIR"
  fi
}

build_cli() {
  step "Installing dependencies and building carto"
  ( cd "$REPO_DIR" && "${PNPM[@]}" install --frozen-lockfile && "${PNPM[@]}" -r build )
  [ -f "$CLI_TARGET" ] || die "build completed without creating $CLI_TARGET."
  chmod +x "$CLI_TARGET"
}

assert_link_available() {
  local link="$1"
  local target="$2"
  if [ -L "$link" ]; then
    [ "$(readlink "$link")" = "$target" ] || die "$link is a symlink not owned by the carto installer; move it aside and re-run."
  elif [ -e "$link" ]; then
    die "$link already exists and is not owned by the carto installer; move it aside and re-run."
  fi
}

check_link_conflicts() {
  local name
  [ ! -e "$BIN_DIR" ] || [ -d "$BIN_DIR" ] || die "$BIN_DIR exists and is not a directory."
  [ ! -e "$SKILLS_DIR" ] || [ -d "$SKILLS_DIR" ] || die "$SKILLS_DIR exists and is not a directory."
  assert_link_available "$CLI_LINK" "$CLI_TARGET"
  for name in "${SKILL_NAMES[@]}"; do
    assert_link_available "$SKILLS_DIR/$name" "$REPO_DIR/skills/$name"
  done
}

ensure_link() {
  local link="$1"
  local target="$2"
  if [ ! -L "$link" ]; then
    ln -s "$target" "$link"
  fi
}

link_cli_and_skills() {
  local name
  mkdir -p "$BIN_DIR" "$SKILLS_DIR"
  step "Linking carto → $CLI_LINK"
  ensure_link "$CLI_LINK" "$CLI_TARGET"
  for name in "${SKILL_NAMES[@]}"; do
    [ -d "$REPO_DIR/skills/$name" ] || die "checkout does not contain the $name skill."
    step "Linking $name skill → $SKILLS_DIR/$name"
    ensure_link "$SKILLS_DIR/$name" "$REPO_DIR/skills/$name"
  done
}

path_contains_bin() {
  case ":${PATH:-}:" in
    *":$BIN_DIR:"*|*":$BIN_DIR/:"*) return 0 ;;
    *) return 1 ;;
  esac
}

file_has_line() {
  local file="$1"
  local expected="$2"
  local line
  [ -f "$file" ] || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    [ "$line" = "$expected" ] && return 0
  done < "$file"
  return 1
}

select_shell_rc() {
  local shell="${SHELL:-}"
  case "${shell##*/}" in
    zsh) printf '%s\n' "$HOME/.zprofile" ;;
    bash)
      if [ -f "$HOME/.bash_profile" ]; then
        printf '%s\n' "$HOME/.bash_profile"
      elif [ -f "$HOME/.bash_login" ]; then
        printf '%s\n' "$HOME/.bash_login"
      else
        printf '%s\n' "$HOME/.profile"
      fi
      ;;
    *) return 1 ;;
  esac
}

configure_path() {
  local existing_rc rc last_character
  path_contains_bin && return
  if [ -f "$PATH_RC_FILE" ]; then
    IFS= read -r existing_rc < "$PATH_RC_FILE"
    if file_has_line "$existing_rc" "$PATH_LINE"; then
      say "$BIN_DIR is already configured in $existing_rc."
      return
    fi
  fi
  if ! rc="$(select_shell_rc)"; then
    say "Your shell is not supported for automatic PATH setup."
    say 'Add this line to your shell configuration:'
    say "  $PATH_LINE"
    return
  fi
  touch "$rc"
  if file_has_line "$rc" "$PATH_LINE"; then
    say "$BIN_DIR is already configured in $rc."
    return
  fi
  cp -p "$rc" "$PATH_BACKUP_FILE"
  if [ -s "$rc" ]; then
    last_character="$(tail -c 1 "$rc")"
    [ -z "$last_character" ] || printf '\n' >> "$rc"
  fi
  printf '%s\n' "$PATH_LINE" >> "$rc"
  cp -p "$rc" "$PATH_INSTALLED_FILE"
  printf '%s\n' "$rc" > "$PATH_RC_FILE"
  say "Added $BIN_DIR to PATH in $rc."
}

remove_owned_path_line() {
  local rc="$1"
  local count=0
  local seen=0
  local line temp
  while IFS= read -r line || [ -n "$line" ]; do
    [ "$line" = "$PATH_LINE" ] && count=$((count + 1))
  done < "$rc"
  [ "$count" -gt 0 ] || return
  temp="$(mktemp "${rc}.carto.XXXXXX")"
  cp -p "$rc" "$temp"
  : > "$temp"
  while IFS= read -r line || [ -n "$line" ]; do
    if [ "$line" = "$PATH_LINE" ]; then
      seen=$((seen + 1))
      [ "$seen" -eq "$count" ] && continue
    fi
    printf '%s\n' "$line" >> "$temp"
  done < "$rc"
  cp -p "$temp" "$rc"
  rm -f "$temp"
}

remove_owned_path_config() {
  local rc
  [ -f "$PATH_RC_FILE" ] && [ ! -L "$PATH_RC_FILE" ] || return
  IFS= read -r rc < "$PATH_RC_FILE"
  case "$rc" in
    "$HOME/.zprofile"|"$HOME/.bash_profile"|"$HOME/.bash_login"|"$HOME/.profile") ;;
    *) say "kept PATH configuration because installer state is not valid"; return ;;
  esac
  if [ -f "$rc" ]; then
    if [ -f "$PATH_INSTALLED_FILE" ] && [ ! -L "$PATH_INSTALLED_FILE" ] && [ -f "$PATH_BACKUP_FILE" ] && [ ! -L "$PATH_BACKUP_FILE" ] && cmp -s "$rc" "$PATH_INSTALLED_FILE"; then
      cp -p "$PATH_BACKUP_FILE" "$rc"
    else
      remove_owned_path_line "$rc"
    fi
    say "removed installer PATH setup from $rc"
  fi
}
remove_owned_link() {
  local link="$1"
  local target="$2"
  if [ -L "$link" ] && [ "$(readlink "$link")" = "$target" ]; then
    rm -f "$link"
    say "removed $link"
  elif [ -e "$link" ] || [ -L "$link" ]; then
    say "kept $link because it is not owned by the carto installer"
  fi
}

do_install() {
  local name
  require git
  require node
  check_node_version
  configure_package_manager
  check_link_conflicts
  prepare_install_root
  clone_or_update
  build_cli
  link_cli_and_skills
  configure_path
  printf '\n%s✓ carto installed.%s\n' "$GREEN" "$RESET"
  say "Open a new shell, then verify: carto --help"
  for name in "${SKILL_NAMES[@]}"; do
    say "Installed $name skill at $SKILLS_DIR/$name"
  done
}

do_uninstall() {
  local name
  remove_owned_link "$CLI_LINK" "$CLI_TARGET"
  for name in "${SKILL_NAMES[@]}"; do
    remove_owned_link "$SKILLS_DIR/$name" "$REPO_DIR/skills/$name"
  done
  if [ ! -L "$CARTO_HOME" ] && [ -f "$MARKER_FILE" ] && [ ! -L "$MARKER_FILE" ] && [ "$(cat "$MARKER_FILE")" = "$MARKER_VALUE" ]; then
    remove_owned_path_config
    rm -rf "$CARTO_HOME"
    say "removed $CARTO_HOME"
  elif [ -e "$CARTO_HOME" ] || [ -L "$CARTO_HOME" ]; then
    say "kept $CARTO_HOME because it is not owned by the carto installer"
  fi
}

usage() {
  cat <<USAGE
carto installer

Usage:
  install.sh                 Install or fast-forward update carto from main
  install.sh --uninstall     Remove installer-owned CLI, skill, PATH setup, and checkout
  install.sh --help

Environment:
  CARTO_REPO_URL   Override clone URL (default: https://github.com/5u4/carto.git)
  CARTO_DIR        Override install root (default: \$HOME/.carto)
USAGE
}

main() {
  case "${1:-}" in
    ""|install) do_install ;;
    --uninstall|uninstall) do_uninstall ;;
    -h|--help|help) usage ;;
    *) usage; exit 1 ;;
  esac
}

main "${1:-}"
