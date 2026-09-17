// Commits: `type(scope): subject` — lowercase imperative subject, no trailing period.
// Scope is the layer or feature touched (server, web, mobile, contracts, domain, ui, tests, db, ci)
// and is optional; the type list is the one AGENTS.md names.
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", ["feat", "fix", "refactor", "style", "chore", "docs", "test", "perf", "ci"]],
    "subject-case": [2, "always", "lower-case"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100],
  },
};
