#!/usr/bin/env bash
# Paperclip Kit — one command for everything: run it inside a project (new, or on an older Paperclip).
#
#   ~/paperclip-kit/setup.sh [project-dir]     default: the current directory. Safe to re-run.
#   --no-memory   skip ai-memory              --no-codex   skip Codex
#
# This machine, once (each step is skipped when already done):
#   ai-memory, native (macOS release binary + login service); its hooks + MCP for Claude Code and
#   Codex, with --project-strategy repo-root (a repo's worktrees share one memory); Superpowers
#   for Codex; the Paperclip block in ~/.codex/AGENTS.md.
# This project:
#   the company layer (upgrading an older one in place: its machinery goes to a backup, STATUS,
#   decisions and STORY stay, your own CLAUDE.local.md sections, playbook rules and hired roles
#   are carried over for review), Superpowers for Claude Code (this repo only), and --company-only
#   when the repo keeps its own .agents/.
set -euo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="" MEMORY=1 CODEX=1
for a in "$@"; do
  case "$a" in
    --no-memory) MEMORY=0 ;;
    --no-codex) CODEX=0 ;;
    -h|--help) sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "✗ unknown option: $a" >&2; exit 1 ;;
    *) DEST="$a" ;;
  esac
done
DEST="$(cd "${DEST:-$PWD}" && pwd)"
command -v codex >/dev/null || CODEX=0
LOG="$(mktemp -t paperclip-setup)"
say() { printf '%s\n' "$*"; }
step() { printf '\n▸ %s\n' "$*"; }
ok() { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*"; }

say "Paperclip Kit $(tr -d '[:space:]' < "$KIT/VERSION") → $DEST"

# ---------- ai-memory (this machine) ----------
AIM_URL=http://127.0.0.1:49374
AIM_HOME="$HOME/Applications/ai-memory"
AIM_LABEL=com.github.akitaonrails.ai-memory
aim_up() { [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$AIM_URL/mcp" || true)" = 405 ]; }

if [ "$MEMORY" -eq 1 ]; then
  step "ai-memory (this machine)"
  if ! command -v ai-memory >/dev/null && [ ! -x "$AIM_HOME/ai-memory" ]; then
    if [ "$(uname -s)" != Darwin ]; then
      warn "automatic install is macOS-only — install it from https://github.com/akitaonrails/ai-memory#quick-start, then re-run"
      MEMORY=0
    else
      arch="$(uname -m)"; [ "$arch" = arm64 ] && arch=aarch64
      tar="ai-memory-macos-$arch.tar.gz"; base="https://github.com/akitaonrails/ai-memory/releases/latest/download"
      mkdir -p "$AIM_HOME"
      ( cd "$AIM_HOME" && curl -fsSL -O -L "$base/$tar" && curl -fsSL -L -o "$tar.sha256" "$base/$tar.sha256" \
        && [ "$(awk '{print $1}' "$tar.sha256")" = "$(shasum -a 256 "$tar" | awk '{print $1}')" ] && tar -xzf "$tar" ) >>"$LOG" 2>&1 \
        || { warn "download or checksum failed (details: $LOG)"; exit 1; }
      ok "downloaded $("$AIM_HOME/ai-memory" --version 2>/dev/null) to $AIM_HOME (checksum verified)"
    fi
  fi
fi
if [ "$MEMORY" -eq 1 ]; then
  AIM="$(command -v ai-memory || echo "$AIM_HOME/ai-memory")"
  if ! command -v ai-memory >/dev/null; then
    mkdir -p "$HOME/.local/bin" && ln -sf "$AIM" "$HOME/.local/bin/ai-memory" && AIM="$HOME/.local/bin/ai-memory"
    case ":$PATH:" in *":$HOME/.local/bin:"*) ok "on PATH as ai-memory" ;; *) warn "add ~/.local/bin to your PATH to type ai-memory" ;; esac
  fi
  if ! aim_up; then
    "$AIM" init >>"$LOG" 2>&1 || true
    if [ "$(uname -s)" = Darwin ]; then
      plist="$HOME/Library/LaunchAgents/$AIM_LABEL.plist"
      src="$(dirname "$(readlink -f "$AIM" 2>/dev/null || echo "$AIM")")/packaging/launchd/$AIM_LABEL.plist"
      mkdir -p "$HOME/Library/Logs/ai-memory" "$HOME/Library/LaunchAgents"
      [ -f "$plist" ] || sed -e "s|__AI_MEMORY_BIN__|$(readlink -f "$AIM" 2>/dev/null || echo "$AIM")|" -e "s|__HOME__|$HOME|" "$src" > "$plist"
      launchctl bootstrap "gui/$(id -u)" "$plist" >>"$LOG" 2>&1 || launchctl kickstart -k "gui/$(id -u)/$AIM_LABEL" >>"$LOG" 2>&1 || true
    else
      nohup "$AIM" serve --transport http >>"$LOG" 2>&1 &
    fi
    for _ in $(seq 1 30); do aim_up && break; sleep 1; done
  fi
  if aim_up; then ok "server running at $AIM_URL (starts at login)"; else warn "server not reachable at $AIM_URL (details: $LOG)"; MEMORY=0; fi
fi
if [ "$MEMORY" -eq 1 ]; then
  hooked() { grep -q "ai-memory" "$1" 2>/dev/null && grep -q "repo-root" "$1" 2>/dev/null; }
  if hooked "$HOME/.claude/settings.json"; then ok "Claude Code hooks already connected"
  else "$AIM" install-hooks --agent claude-code --apply --project-strategy repo-root >>"$LOG" 2>&1 && ok "Claude Code hooks connected (repo-root)" || warn "Claude Code hooks failed (details: $LOG)"; fi
  if grep -q '"ai-memory"' "$HOME/.claude.json" 2>/dev/null; then ok "Claude Code memory tools already connected"
  else "$AIM" install-mcp --client claude-code --apply >>"$LOG" 2>&1 && ok "Claude Code memory tools connected" || warn "Claude Code MCP failed (details: $LOG)"; fi
  if [ "$CODEX" -eq 1 ]; then
    if hooked "${CODEX_HOME:-$HOME/.codex}/hooks.json"; then ok "Codex hooks already connected"
    else "$AIM" install-hooks --agent codex --apply --project-strategy repo-root >>"$LOG" 2>&1 && { ok "Codex hooks connected (repo-root)"; CODEX_TRUST=1; } || warn "Codex hooks failed (details: $LOG)"; fi
    if codex mcp list 2>/dev/null | grep -q "^ai-memory"; then ok "Codex memory tools already connected"
    else "$AIM" install-mcp --client codex --apply >>"$LOG" 2>&1 || codex mcp add ai-memory --url "$AIM_URL/mcp" >>"$LOG" 2>&1; ok "Codex memory tools connected"; fi
  fi
fi

# ---------- the project ----------
step "the company in $(basename "$DEST")"
FLAGS=(--with-superpowers)
[ "$CODEX" -eq 1 ] && FLAGS+=(--with-codex)
OLD=0
if [ -f "$DEST/.paperclip/HARNESS.md" ] || [ -f "$DEST/.paperclip/PLAYBOOK.md" ] || [ -e "$DEST/.paperclip/bin/pc" ] \
   || { [ -f "$DEST/CLAUDE.local.md" ] && [ ! -f "$DEST/.paperclip/COMPANY.md" ] && grep -qi paperclip "$DEST/CLAUDE.local.md"; }; then
  OLD=1; FLAGS+=(--replace-company)
fi
if [ -d "$DEST/.git" ] && [ -n "$(git -C "$DEST" ls-files .agents 2>/dev/null | head -1)" ]; then FLAGS+=(--company-only); fi
HAD_COMPANY=0; [ -f "$DEST/.paperclip/COMPANY.md" ] && HAD_COMPANY=1
before="$(ls -d "$DEST"/.paperclip/.backup-* 2>/dev/null || true)"
bash "$KIT/install.sh" "$DEST" "${FLAGS[@]}" >>"$LOG" 2>&1 || { warn "install failed (details: $LOG)"; exit 1; }
if [ "$OLD" -eq 1 ]; then
  backup="$(comm -13 <(printf '%s\n' "$before") <(ls -d "$DEST"/.paperclip/.backup-* 2>/dev/null) | tail -1)"
  ok "upgraded an older Paperclip: its machinery is in ${backup#$DEST/}; STATUS, decisions and STORY kept"
  [ -n "$backup" ] && node "$KIT/bin/lib/carry-over.mjs" "$DEST" "$backup" | sed 's/^  ✓/  ✓/'
elif [ "$HAD_COMPANY" -eq 1 ]; then
  ok "company layer up to date (existing files are never overwritten)"
else
  ok "company layer installed"
fi
case " ${FLAGS[*]} " in *" --company-only "*) ok "engineering layer skipped (this repo has its own .agents/)" ;; esac
grep -E "Superpowers (enabled|already|installed)|Codex:|block" "$LOG" | sed 's/^ *//; s/^✓ //; s/^/  ✓ /' | sort -u | grep -v "^  ✓ →" || true

# ---------- done ----------
step "ready"
say "  Open claude (or codex) in $DEST and say: paperclip on"
[ "${CODEX_TRUST:-0}" -eq 1 ] && say "  One click left: the first time you open codex, choose \"Trust all and continue\" for the new hooks."
[ "$MEMORY" -eq 1 ] && say "  Claude stopped? /exit, open codex in the same folder, say \"continue with what's left\"."
say "  Full log: $LOG"
