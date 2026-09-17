/**
 * The pure core of `yarn copy:diff`: flatten a reference copy module and the app's
 * `@domain/copy` barrel into `key → string` maps, diff them, and split the result against
 * the allowlist. No I/O here — `copy-diff.ts` owns the reference lookup and the process
 * exit; this half is what the unit spec pins.
 */

export type FlatCopy = Record<string, string>;

/**
 * Walks a module's exported sections into dot-path keys — `EXAMPLE_COPY.list.title`, list
 * entries by index (`EXAMPLE_COPY.steps.0.label`). Strings and numbers are copy; functions
 * (the app barrel exports `fill`) and everything else are machinery and are skipped.
 */
export function flattenCopy(sections: Record<string, unknown>): FlatCopy {
  const flat: FlatCopy = {};
  const walk = (value: unknown, path: string) => {
    if (typeof value === "string" || typeof value === "number") {
      flat[path] = String(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const [index, entry] of value.entries()) walk(entry, `${path}.${index}`);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) walk(entry, path ? `${path}.${key}` : key);
    }
    // functions, booleans, null — not copy
  };
  walk(sections, "");
  return flat;
}

export type DiffEntry = { key: string; app?: string; reference?: string };

export type CopyDiff = {
  /** the key exists on both sides with different strings */
  changed: DiffEntry[];
  /** the reference has it, the app's copy layer doesn't — not adopted yet */
  missing: DiffEntry[];
  /** the app's copy layer has it, the reference doesn't — app-only or renamed */
  extra: DiffEntry[];
};

export function diffCopy(app: FlatCopy, reference: FlatCopy): CopyDiff {
  const diff: CopyDiff = { changed: [], missing: [], extra: [] };
  const keys = [...new Set([...Object.keys(reference), ...Object.keys(app)])].sort();
  for (const key of keys) {
    const inApp = key in app;
    const inReference = key in reference;
    if (inApp && inReference) {
      if (app[key] !== reference[key]) diff.changed.push({ key, app: app[key], reference: reference[key] });
    } else if (inReference) {
      diff.missing.push({ key, reference: reference[key] });
    } else {
      diff.extra.push({ key, app: app[key] });
    }
  }
  return diff;
}

export type AllowRule = {
  /** matches the key itself and everything under it (`prefix` or `prefix.…`) */
  prefix: string;
  reason: string;
};

export const matchesRule = (key: string, rule: AllowRule): boolean =>
  key === rule.prefix || key.startsWith(`${rule.prefix}.`);

export type AllowedEntry = DiffEntry & { kind: keyof CopyDiff; reason: string };

/**
 * Splits a diff into what fails the run and what the allowlist absorbs — each absorbed
 * entry keeps the rule's reason, so the report can still show the ruled divergences.
 */
export function partitionDiff(diff: CopyDiff, rules: AllowRule[]): { blocking: CopyDiff; allowed: AllowedEntry[] } {
  const blocking: CopyDiff = { changed: [], missing: [], extra: [] };
  const allowed: AllowedEntry[] = [];
  for (const kind of ["changed", "missing", "extra"] as const) {
    for (const entry of diff[kind]) {
      const rule = rules.find((candidate) => matchesRule(entry.key, candidate));
      if (rule) allowed.push({ ...entry, kind, reason: rule.reason });
      else blocking[kind].push(entry);
    }
  }
  return { blocking, allowed };
}
