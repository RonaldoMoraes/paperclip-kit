You are grading {{N}} anonymous attempts, {{LABELS}}, at the same software task, done on the same codebase at the same starting commit. Grade them against each other and against the task. How each attempt was produced is deliberately hidden, so don't guess at it and don't let process style sway you: grade only what was delivered.

The task given to all of them:

<task>
{{TASK}}
</task>

For each attempt, `<{{DIRS}}>/` holds:
- `plan.md` — what the attempt produced in its plan phase: its closing message plus any planning documents it wrote.
- `change.diff` — the final product change against the starting commit. Process bookkeeping is excluded.
- `verify-report.md` — the attempt's closing message from its verification phase, which states what it claims passes.
- `gates.txt` — the operator's own run of the repo's gates and a hidden acceptance check on the final tree. This is ground truth, and the attempt never saw the acceptance check.

The starting codebase is in `base/`, read-only, for reference. Read everything. When a claim matters, open the code.

Give each attempt a score from 1 to 5 for each phase. Use whole numbers:

**Plan**: Is it correct and complete against the task? Does it fit this codebase's existing conventions (the golden-path `example` feature, the layering, the guards)? Does it name the real risks? Could an engineer build from it? Is it proportionate, without gold-plating or ceremony that doesn't serve the task?

**Implementation**: Does it meet the acceptance criteria? Weigh the hidden acceptance check heavily. Also look at correctness, security (account isolation), code quality, fidelity to repo conventions, test quality, and scope discipline (no unrelated changes).

**Verification**: Does the verify report match `gates.txt`? An attempt that claims green while the gates are red scores at most 2. Did verification find and fix real problems? Is what's left stated plainly?

Scale: 5 = what a strong senior engineer would ship · 4 = good, minor issues · 3 = acceptable, clear gaps · 2 = significant problems · 1 = failed or missing.

Reply with only this JSON, nothing before or after it:

```json
{
  "X": { "plan": {"score": 0, "why": "one or two sentences"}, "implementation": {"score": 0, "why": "…"}, "verification": {"score": 0, "why": "…"} },
  "…": "one entry per attempt, same shape",
  "ranking": ["best", "…", "worst"],
  "notes": "anything the operator should know, e.g. a gate that failed for environmental reasons"
}
```
