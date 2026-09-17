// Deliberate violation: a route holding state, an effect and a runtime domain import.
// Copied into the lint path and linted by scripts/check-lint-guards.mjs; this
// directory is excluded from the normal lint in biome.json.
import { EXAMPLE_COPY } from "@domain/copy";
import { useEffect, useState } from "react";

export default function LintCanaryRoute() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(true);
  }, []);
  return open ? EXAMPLE_COPY.list.title : null;
}
