// Deliberately violates biome/server-state-boundary.grit inside a screens/
// directory: a multi-specifier runtime import of the query library (the clause
// shape that silently escaped the original snippet pattern) and a useLoaderData
// import.
// Copied into the lint path and linted by scripts/check-lint-guards.mjs; this
// directory is excluded from the normal lint in biome.json.
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLoaderData } from "@tanstack/react-router";

export function LintCanaryScreen() {
  const query = useQuery({ queryKey: ["lint-canary"], queryFn: async () => 1 });
  const mutation = useMutation({ mutationFn: async () => 2 });
  const data = useLoaderData({ strict: false });
  return <Link to="/">{String([query.data, mutation.status, data])}</Link>;
}
