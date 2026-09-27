#!/usr/bin/env bash
# Approach "superpowers-aimem": wires ai-memory into ONE workspace, the way its installers would
# for Claude Code, but project-local instead of the user's global config:
#   - a fresh, empty ai-memory server (container pcbench-ai-memory, 127.0.0.1:49384, zero-LLM mode)
#   - its lifecycle hooks → <ws>/.claude/settings.local.json   (git-ignored by the fixture)
#   - its routing snippet  → <ws>/CLAUDE.local.md              (git-ignored by the fixture)
#   - its managed skills   → <ws>/.claude/skills/ai-memory-*   (added to .git/info/exclude)
#   - its MCP entry        → bench/mcp-aimem.json              (passed by run.mjs)
#
#   bench/aimem/setup.sh <workspace>
#   bench/aimem/setup.sh <workspace> --no-instructions   hooks + MCP only: the approach brings its
#                                                         own memory rules (Paperclip 1.0's COMPANY.md §4)
set -euo pipefail
WS="$(cd "${1:?workspace}" && pwd)"
INSTRUCTIONS=1; [ "${2:-}" = --no-instructions ] && INSTRUCTIONS=0
IMAGE=docker.io/akitaonrails/ai-memory:2.4.1
C=pcbench-ai-memory
URL=http://127.0.0.1:49384
HOOKS="$HOME/paperclip-bench/vendor/ai-memory/hooks/claude-code"
[ -d "$HOOKS" ] || { echo "✗ ai-memory hooks not found at $HOOKS" >&2; exit 1; }

echo "→ fresh ai-memory server"
docker rm -f "$C" >/dev/null 2>&1 || true
docker volume rm -f pcbench-ai-memory-data >/dev/null 2>&1 || true
docker run -d --name "$C" -p 127.0.0.1:49384:49374 -v pcbench-ai-memory-data:/data "$IMAGE" >/dev/null
for _ in $(seq 1 60); do curl -s -o /dev/null -X POST "$URL/mcp" && break; sleep 1; done

echo "→ hooks → .claude/settings.local.json"
node - "$WS/.claude/settings.local.json" "$HOOKS" "$URL" <<'EOF'
const [file, dir, url] = process.argv.slice(2);
const fs = require('fs');
const events = { SessionStart: 'session-start', UserPromptSubmit: 'user-prompt-submit', PreToolUse: 'pre-tool-use',
  PostToolUse: 'post-tool-use', PreCompact: 'pre-compact', Stop: 'stop', SessionEnd: 'session-end',
  SubagentStart: 'subagent-start', SubagentStop: 'subagent-stop' };
const cur = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
cur.hooks ??= {};
for (const [ev, script] of Object.entries(events)) {
  (cur.hooks[ev] ??= []).push({ matcher: '', hooks: [{ type: 'command', command: `AI_MEMORY_HOOK_URL=${url} sh "${dir}/${script}.sh"` }] });
}
fs.mkdirSync(require('path').dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(cur, null, 2) + '\n');
EOF

if [ "$INSTRUCTIONS" -eq 1 ]; then
  echo "→ routing snippet + managed skills (ai-memory install-instructions)"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  ( cd "$TMP" && git init -q )
  docker run --rm -e AI_MEMORY_SERVER_URL="$URL" -v "$TMP:/w" -w /w "$IMAGE" install-instructions >/dev/null 2>&1
  { [ -f "$WS/CLAUDE.local.md" ] && cat "$WS/CLAUDE.local.md" && echo; cat "$TMP/CLAUDE.md"; } >"$WS/CLAUDE.local.md.new"
  mv "$WS/CLAUDE.local.md.new" "$WS/CLAUDE.local.md"
  mkdir -p "$WS/.claude/skills"
  cp -R "$TMP/.claude/skills/"ai-memory-* "$WS/.claude/skills/"
  for p in /CLAUDE.local.md '/.claude/skills/ai-memory-*/' /.claude/settings.local.json; do
    grep -qxF "$p" "$WS/.git/info/exclude" 2>/dev/null || echo "$p" >>"$WS/.git/info/exclude"
  done
else
  grep -qxF /.claude/settings.local.json "$WS/.git/info/exclude" 2>/dev/null || echo /.claude/settings.local.json >>"$WS/.git/info/exclude"
fi
echo "✓ ai-memory wired into $WS"
