/**
 * A screen's analytics id, from the route's own pattern — never from the URL the user hit.
 *
 * Both apps report `screen-viewed` automatically, and both name the screen the same way so
 * one funnel reads across web and mobile: the router's leaf pattern on web
 * (`/example/$id`), the navigator's segments on mobile (`(app)`, `example`, `[id]`), each
 * reduced here to `example-id`. A parameter's placeholder is kept, its value never is —
 * an id in the path is a fact about one user and has no business in an event. Groups
 * (`(app)`) and pathless layouts (`_app`) are structure, not screens, and are dropped.
 *
 * The answer always matches the contract's `slug`: the pieces are lowercase `a-z0-9`
 * joined by single dashes, the empty path is `root`, and nothing runs past 64.
 */
export function screenSlug(segments: readonly string[]): string {
  const parts = segments
    .flatMap((segment) => segment.split("/"))
    .filter((segment) => segment !== "" && !segment.startsWith("_") && !/^\(.*\)$/.test(segment))
    .map((segment) =>
      segment
        .replace(/^[$[]+|]+$/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    )
    .filter((segment) => segment !== "");
  const joined = parts.join("-").replace(/-+/g, "-");
  if (joined === "") return "root";
  return joined.slice(0, 64).replace(/-+$/, "");
}
