#!/usr/bin/env bash
# Paperclip Kit — drop the AI company (template/) and the engineering layer (engineering/) into a
# repo, without clobbering anything and without touching its history.
#
#   install.sh [dir]                 install into <dir> (default: the current directory)
#   install.sh --new <dir>           create <dir> first, then install
#   install.sh --with-superpowers    also install the Superpowers plugin for this repo only
#                                    (claude plugin install … --scope local)
#   install.sh --replace-company     upgrading an older install: move the old company machinery
#                                    into .paperclip/.backup-<time>/ first, then install fresh.
#                                    STATUS.md, decisions.md and STORY.md stay: they're the company's
#                                    memory, and 1.0 reads their older formats
#   install.sh --company-only        skip the engineering layer (a repo with its own .agents/)
#
# The company layer lands as real files (CLAUDE.local.md, .paperclip/, .claude/{agents,commands}/*.md).
# The engineering layer lands under .agents/{agents,commands,skills}, with one relative symlink per
# entry in .claude/. Nothing is ever overwritten. In a repo with .git, every installed path goes to
# .git/info/exclude, so the work repo stays pristine.
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$KIT_DIR/template"
ENGINEERING="$KIT_DIR/engineering"
VERSION="$(tr -d '[:space:]' < "$KIT_DIR/VERSION" 2>/dev/null || echo 0.0.0)"

usage() { sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

DEST="" NEW=0 WITH_SP=0 REPLACE=0 COMPANY_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --new) NEW=1; shift; [ $# -gt 0 ] || { echo "✗ --new needs a directory" >&2; exit 1; }; DEST="$1" ;;
    --with-superpowers) WITH_SP=1 ;;
    --replace-company) REPLACE=1 ;;
    --company-only) COMPANY_ONLY=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "✗ unknown option: $1" >&2; usage >&2; exit 1 ;;
    *) DEST="$1" ;;
  esac
  shift
done
DEST="${DEST:-$PWD}"
[ -d "$TEMPLATE" ] && [ -d "$ENGINEERING" ] || { echo "✗ template/ or engineering/ missing next to install.sh" >&2; exit 1; }
if [ "$NEW" -eq 1 ]; then mkdir -p "$DEST"; echo "→ Created: $DEST"; fi
[ -d "$DEST" ] || { echo "✗ $DEST does not exist (use --new <dir> to create it)" >&2; exit 1; }
DEST="$(cd "$DEST" && pwd)"
echo "→ Installing Paperclip Kit $VERSION into: $DEST"

INSTALLED_PATHS="$(mktemp)"
trap 'rm -f "$INSTALLED_PATHS"' EXIT

# --replace-company: the old company machinery (harness, ledger, personas, commands) is moved aside,
# never deleted. The company's memory (STATUS.md, decisions.md, STORY.md), anything else the Founder
# keeps in .paperclip/, and the scaffold's own files stay put.
if [ "$REPLACE" -eq 1 ]; then
  BACKUP="$DEST/.paperclip/.backup-$(date +%Y%m%d-%H%M%S)"
  moved=0
  for p in CLAUDE.local.md \
           .paperclip/PLAYBOOK.md .paperclip/HARNESS.md \
           .paperclip/bin .paperclip/briefs .paperclip/campaigns .paperclip/contracts .paperclip/findings \
           .paperclip/log .paperclip/orders .paperclip/research .paperclip/work \
           .claude/agents/ceo.md .claude/agents/cto.md .claude/agents/crgo.md .claude/agents/cmo.md \
           .claude/agents/tech-lead.md .claude/agents/engineer.md .claude/agents/critic.md \
           .claude/agents/researcher.md .claude/agents/uiux.md \
           .claude/commands/paperclip.md .claude/commands/role.md .claude/commands/hire.md .claude/commands/where.md \
           .claude/commands/decide.md .claude/commands/brief.md .claude/commands/campaign.md .claude/commands/build.md \
           .claude/commands/task.md .claude/commands/findings.md .claude/commands/handoff.md; do
    if [ -e "$DEST/$p" ]; then
      mkdir -p "$BACKUP/$(dirname "$p")"; mv "$DEST/$p" "$BACKUP/$p"; moved=$((moved + 1))
    fi
  done
  echo "  moved $moved old company-layer paths to ${BACKUP#$DEST/} (STATUS.md, decisions.md, STORY.md kept in place)"
fi

# copy_tree <src-root> <dest-prefix>: every file under src-root to DEST/<dest-prefix>/<rel>, never
# overwriting; records the destination for the exclude list.
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

# link_tree <dir>: one relative symlink per top-level entry of engineering/<dir>
# (DEST/.claude/<dir>/<entry> → ../../.agents/<dir>/<entry>), so the company layer's real files sit
# beside the links. Never overwrites.
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
chmod +x "$DEST/.paperclip/bin/panel" "$DEST/.paperclip/bin/panel.mjs" 2>/dev/null || true
if [ "$COMPANY_ONLY" -eq 1 ]; then
  echo "  engineering layer skipped (--company-only)"
else
  echo "  engineering layer (engineering/ → .agents/, linked from .claude/)"
  for d in agents commands skills; do
    copy_tree "$ENGINEERING/$d" ".agents/$d"
    link_tree "$d"
  done
fi

# .paperclip/kit.json: where the kit lives, for /scaffold and /module. Always refreshed.
mkdir -p "$DEST/.paperclip"
printf '{\n  "kitPath": "%s",\n  "version": "%s",\n  "installedAt": "%s"\n}\n' "$KIT_DIR" "$VERSION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DEST/.paperclip/kit.json"
echo "  write: .paperclip/kit.json"

if [ -d "$DEST/.git" ]; then
  EXC="$DEST/.git/info/exclude"
  mkdir -p "$(dirname "$EXC")"
  add_excl() { grep -qxF "$1" "$EXC" 2>/dev/null || echo "$1" >> "$EXC"; }
  add_excl "/CLAUDE.local.md"
  add_excl "/.paperclip/"
  while IFS= read -r p; do
    case "$p" in /CLAUDE.local.md|/.paperclip/*) ;; *) add_excl "$p" ;; esac
  done < "$INSTALLED_PATHS"
  echo "  → every installed path registered in .git/info/exclude (local-only; the repo stays clean)"
fi

# ---------- the engine and the memory ----------
echo
if [ "$WITH_SP" -eq 1 ]; then
  if command -v claude >/dev/null; then
    echo "→ Superpowers for this repo (claude plugin install superpowers@claude-plugins-official --scope local)"
    ( cd "$DEST" && claude plugin install superpowers@claude-plugins-official --scope local ) \
      && echo "  ✓ Superpowers enabled here" \
      || echo "  ✗ plugin install failed — run it by hand inside Claude Code: /plugin install superpowers@claude-plugins-official"
  else
    echo "✗ --with-superpowers: the claude CLI is not on PATH"
  fi
fi
SP_STATE="not detected"
if command -v claude >/dev/null && ( cd "$DEST" && claude plugin list 2>/dev/null | grep -q "superpowers@" ); then SP_STATE="installed"; fi
MEM_URL="${AI_MEMORY_SERVER_URL:-http://127.0.0.1:49374}"
if curl -s -o /dev/null --max-time 1 "$MEM_URL" 2>/dev/null; then MEM_STATE="running at $MEM_URL"
elif command -v ai-memory >/dev/null; then MEM_STATE="installed, server not reachable at $MEM_URL"
else MEM_STATE="not detected"; fi

cat <<EOF
✓ Paperclip Kit $VERSION installed in $DEST

  The company:  CLAUDE.local.md · .paperclip/{COMPANY.md, STATUS.md, decisions.md, roles/, bin/panel}
  Engine:       Superpowers — $SP_STATE
  Memory:       ai-memory — $MEM_STATE
EOF
if [ "$SP_STATE" != installed ]; then cat <<'EOF'

  → Superpowers: re-run with --with-superpowers, or inside Claude Code:
      /plugin install superpowers@claude-plugins-official
EOF
fi
case "$MEM_STATE" in running*) ;; *) cat <<'EOF'

  → ai-memory (optional — without it, /handoff writes .paperclip/HANDOFF.md instead):
      https://github.com/akitaonrails/ai-memory#quick-start — then, once:
      ai-memory install-hooks --agent claude-code --apply
      ai-memory install-mcp   --client claude-code --apply
EOF
;; esac
cat <<EOF

  Then open Claude Code here and say:
    paperclip on        the company wakes up (CEO answers, control panel shown)
    /where --html       the control panel as a dashboard
    /build <something>  the CTO triages it and runs it through Superpowers
  Product from scratch: /grill → /scaffold → /feature <name>.
EOF
