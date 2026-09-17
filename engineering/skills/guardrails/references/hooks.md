# Write-time hooks

A hook runs after every `Edit|Write|MultiEdit` (`PostToolUse` in `.claude/settings.json`)
and moves a failure to the moment the agent can fix it in the same breath. The base guard
is `.claude/hooks/guard.sh`: generated-file refusal plus the testing contract.

## The contract (every hook follows it)

- Read the payload from stdin with `jq`: `.tool_input.file_path`, `.cwd`. Resolve the
  path to absolute against `cwd`.
- Cheap scope gate first — a string comparison, no subprocess — and `exit 0` for
  anything outside the tree the rule is about.
- **Silent and `exit 0` on pass.** `exit 2` with the diagnostic on **stderr** when the
  agent must act: what is wrong, and what to do instead, in the tone of a reviewer.
- An **advisory** hook always exits 0 and speaks through
  `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"…"}}` on
  stdout — a reminder, not a refusal.
- `timeout: 15` in settings; a hook that takes longer belongs in CI, not here.
- The single source of truth stays a script CI also runs (`scripts/check-*.mjs`); the
  hook only invokes it. A rule that exists only in a hook is a rule CI cannot see.

## Diff-aware rules

`.claude/hooks/lib/added.sh` gives `added PATTERN FILE`: how many lines matching the
extended regex the working copy has beyond `HEAD:` — so only what *this edit adds*
blocks, and a rule can land on a tree with a backlog. `is_new_file FILE` is for rules
about files this edit creates.

```bash
source "$(dirname "${BASH_SOURCE[0]}")/lib/added.sh"
findings=()
check() { [ "$(added "$1" "$abs")" -gt 0 ] && findings+=("$2"); return 0; }

case "$rel" in *.spec.ts | *.spec.tsx)
  check 'vi\.hoisted[[:space:]]*\(' 'vi.hoisted() is banned — declare `const mockX = vi.fn()` at file scope and keep vi.mock() at the bottom.'
esac

[ "${#findings[@]}" -eq 0 ] && exit 0
{ printf 'guard blocked this edit (%s)\n\n' "$rel"; for f in "${findings[@]}"; do printf '  - %s\n\n' "$f"; done; } >&2
exit 2
```

Counting is the clearest case for this tier ("one `useFeatureFlag()` per component");
GritQL cannot express it. Everything a `.grit` *can* express belongs in a `.grit` — a
hook is slower, invisible to `yarn lint`, and only fires for the agent's own edits.

## Wiring

```json
{ "type": "command", "if": "Edit(**)", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard.sh", "timeout": 15, "statusMessage": "…" }
```

`if: Edit(<glob>)` keeps the hook from even starting for paths it does not cover. A
module contributes hooks through `module.json` → `hooks: [ { if, command, timeout,
statusMessage } ]` with the script under `files/.claude/hooks/`; the scaffold appends
them to the `PostToolUse` list.

## Testing a hook by hand

```bash
printf '{"tool_input":{"file_path":"apps/web/src/app/routeTree.gen.ts"},"cwd":"%s"}' "$PWD" \
  | .claude/hooks/guard.sh; echo "exit $?"     # expect 2 and a message on stderr
```
`bash -n` for syntax, `shellcheck` when installed. A hook that cannot be exercised from a
shell cannot be trusted from the harness.
