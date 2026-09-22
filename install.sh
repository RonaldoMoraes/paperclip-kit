#!/usr/bin/env bash
# Paperclip Kit — drop the company layer (template/) and the engineering personas, commands and
# skills (engineering/) into a repo, without clobbering anything and without touching its history.
#
#   install.sh [dir]          install into <dir> (default: the current directory)
#   install.sh --new <dir>    create <dir> first, then install
#
# One source of truth, the same layout the scaffold writes: the engineering layer lands under
# .agents/{agents,commands,skills} and .claude/<dir>/<entry> is a relative symlink into it, one link per
# top-level entry. The company layer stays real files (CLAUDE.local.md, .paperclip/, and its own
# .claude/{agents,commands}/*.md — different file names, so they sit beside the links). Nothing is ever
# clobbered. In a repo with a .git, every installed path is registered in .git/info/exclude (local-only
# ignore), so the work repo stays pristine.
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$KIT_DIR/template"
ENGINEERING="$KIT_DIR/engineering"
VERSION="$(tr -d '[:space:]' < "$KIT_DIR/VERSION" 2>/dev/null || echo 0.0.0)"

usage() {
  sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

DEST=""
NEW=0
while [ $# -gt 0 ]; do
  case "$1" in
    --new) NEW=1; shift; [ $# -gt 0 ] || { echo "✗ --new needs a directory" >&2; exit 1; }; DEST="$1" ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "✗ unknown option: $1" >&2; usage >&2; exit 1 ;;
    *) DEST="$1" ;;
  esac
  shift
done
DEST="${DEST:-$PWD}"

[ -d "$TEMPLATE" ] || { echo "✗ template/ not found next to install.sh" >&2; exit 1; }
[ -d "$ENGINEERING" ] || { echo "✗ engineering/ not found next to install.sh" >&2; exit 1; }

if [ "$NEW" -eq 1 ]; then
  mkdir -p "$DEST"
  echo "→ Created: $DEST"
elif [ ! -d "$DEST" ]; then
  echo "✗ $DEST does not exist (use --new <dir> to create it)" >&2
  exit 1
fi
DEST="$(cd "$DEST" && pwd)"
echo "→ Installing Paperclip Kit $VERSION into: $DEST"

ADDED=0
SKIPPED=0
INSTALLED_PATHS="$(mktemp)"
trap 'rm -f "$INSTALLED_PATHS"' EXIT

# copy_tree <src-root> <dest-prefix> — copies every file under src-root to DEST/<dest-prefix>/<rel>,
# never overwriting; records the relative destination path for the exclude list.
copy_tree() {
  local src="$1" prefix="$2" rel target
  [ -d "$src" ] || return 0
  ( cd "$src" && find . -type f -print0 ) | while IFS= read -r -d '' f; do
    rel="${f#./}"
    target="${prefix:+$prefix/}$rel"
    mkdir -p "$DEST/$(dirname "$target")"
    if [ -e "$DEST/$target" ] || [ -L "$DEST/$target" ]; then
      echo "  skip (exists): $target"
    else
      cp -p "$src/$rel" "$DEST/$target"
      echo "  add: $target"
    fi
    echo "/$target" >> "$INSTALLED_PATHS"
  done
}

# link_tree <dir> — one relative symlink per top-level entry of engineering/<dir>:
# DEST/.claude/<dir>/<entry> → ../../.agents/<dir>/<entry>. Per entry, never per directory, so the
# company layer's own real files in .claude/agents and .claude/commands (and anything /hire writes
# later) sit beside the links. Never overwrites; records the link for the exclude list.
link_tree() {
  local d="$1" name target
  [ -d "$ENGINEERING/$d" ] || return 0
  mkdir -p "$DEST/.claude/$d"
  ( cd "$ENGINEERING/$d" && find . -mindepth 1 -maxdepth 1 -print ) | LC_ALL=C sort | while IFS= read -r e; do
    name="${e#./}"
    case "$name" in .*) continue ;; esac
    target=".claude/$d/$name"
    if [ -e "$DEST/$target" ] || [ -L "$DEST/$target" ]; then
      echo "  skip (exists): $target"
    else
      ln -s "../../.agents/$d/$name" "$DEST/$target"
      echo "  link: $target → ../../.agents/$d/$name"
    fi
    echo "/$target" >> "$INSTALLED_PATHS"
  done
}

echo "  company layer (template/)"
copy_tree "$TEMPLATE" ""
echo "  engineering layer (engineering/ → .agents/, linked from .claude/)"
for d in agents commands skills; do
  copy_tree "$ENGINEERING/$d" ".agents/$d"
  link_tree "$d"
done

# .paperclip/kit.json — where the kit lives, so /scaffold and /module can find it. Always refreshed.
mkdir -p "$DEST/.paperclip"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '{\n  "kitPath": "%s",\n  "version": "%s",\n  "installedAt": "%s"\n}\n' "$KIT_DIR" "$VERSION" "$NOW" > "$DEST/.paperclip/kit.json"
echo "  write: .paperclip/kit.json"

# Local-only git ignore — keeps a work repo pristine (does NOT touch the tracked .gitignore).
if [ -d "$DEST/.git" ]; then
  EXC="$DEST/.git/info/exclude"
  mkdir -p "$(dirname "$EXC")"
  add_excl() { grep -qxF "$1" "$EXC" 2>/dev/null || echo "$1" >> "$EXC"; }
  add_excl "/CLAUDE.local.md"
  add_excl "/.paperclip/"
  while IFS= read -r p; do
    case "$p" in
      /CLAUDE.local.md|/.paperclip/*) ;;   # covered above
      *) add_excl "$p" ;;
    esac
  done < "$INSTALLED_PATHS"
  echo "  → registered every installed path in .git/info/exclude (local-only; the repo stays clean)"
else
  echo "  (no .git here — nothing excluded; when you git init, the scaffold's .gitignore covers CLAUDE.local.md)"
fi

cat <<EOF

✓ Paperclip Kit $VERSION installed in $DEST

  Engineering personas, commands and skills live in .agents/; .claude/{agents,commands,skills} link
  into it, entry by entry — edit only under .agents/. The company layer's own personas and commands
  are real files beside those links.

  The work ledger is $DEST/.paperclip/bin/pc — campaigns, tasks, findings, estimates and the
  handoff brief. It is never installed on your PATH; call it by that path (\`.paperclip/bin/pc
  status\` from anywhere in the tree). If you would rather type \`pc\`, paste this into a shell —
  optional, and nothing else depends on it:

    export PATH="$DEST/.paperclip/bin:\$PATH"

  Next, open Claude Code in that directory and say:
    paperclip on     → the company wakes up (CEO answers)
    /grill           → the interview; writes .paperclip/project.manifest.json
    /scaffold        → generates the product tree from the manifest and runs the gates
  Then /feature <name> clones the golden-path feature for your first real one.

  Upgrading an older install? Files you already had were skipped, never replaced —
  $KIT_DIR/UPGRADE.md lists what to replace or merge by hand.
EOF
