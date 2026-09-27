#!/usr/bin/env bash
# Approach "ecc": ECC (github.com/affaan-m/ECC) the way its README installs it for Claude Code,
# kept inside one workspace:
#   - the plugin (skills, agents, commands, plugin-managed hooks) → loaded by run.mjs via --plugin-dir
#   - rules, which a plugin cannot ship → project-local <ws>/.claude/rules/ecc/{common,typescript}
#     ("rules/common plus one pack for your stack"; the fixture is TypeScript), git-excluded
#   - its memory (sessions, learned skills, instincts) → <run>/ecc-data via ECC_AGENT_DATA_HOME and
#     CLV2_HOMUNCULUS_DIR (config.json), never the user's ~/.claude or ~/.local/share
#
#   bench/ecc/setup.sh <workspace>
set -euo pipefail
WS="$(cd "${1:?workspace}" && pwd)"
ECC="$HOME/paperclip-bench/vendor/ECC"
DATA="$(dirname "$WS")/ecc-data"
[ -f "$ECC/.claude-plugin/plugin.json" ] || { echo "✗ ECC not found at $ECC" >&2; exit 1; }

# The one change to ECC itself, path only: its continuous-learning config hardcodes
# ~/.claude/skills/learned/ (expanded with os.homedir(), ignoring ECC_AGENT_DATA_HOME). Empty, it
# falls back to ECC's own getLearnedSkillsDir(), which honours the override.
CL="$ECC/skills/continuous-learning/config.json"
sed -i '' 's#"learned_skills_path": *"~/.claude/skills/learned/"#"learned_skills_path": ""#' "$CL"
grep -q '"learned_skills_path": ""' "$CL"

rm -rf "$DATA"
mkdir -p "$DATA/agent-home" "$DATA/homunculus"

mkdir -p "$WS/.claude/rules/ecc"
cp -R "$ECC/rules/common" "$ECC/rules/typescript" "$WS/.claude/rules/ecc/"
grep -qxF '/.claude/rules/ecc/' "$WS/.git/info/exclude" 2>/dev/null || echo '/.claude/rules/ecc/' >>"$WS/.git/info/exclude"
echo "✓ ECC $(tr -d '[:space:]' <"$ECC/VERSION") rules in $WS/.claude/rules/ecc · memory in $DATA"
