/**
 * A reference copy module in the shape `yarn copy:diff` reads: one file whose named
 * exports are the copy sections — nested objects of strings, lists allowed — keyed
 * exactly as `@domain/copy` keys them. This one mirrors the base barrel, so a first run
 * against it is green:
 *
 *   COPY_DIFF_PATH=reference/copy.example.ts yarn copy:diff
 *
 * The real reference is whatever owns the words — a design tool's copy export, a base
 * locale, a prototype's copy file — on disk (COPY_DIFF_PATH) or in git (COPY_DIFF_REF +
 * COPY_DIFF_PATH). Delete this file once that is configured. Functions and anything that
 * is not a string or number are ignored on both sides.
 */

export const EXAMPLE_COPY = {
  list: {
    title: "Items",
    empty: "Nothing here yet.",
    count: "{n} of {total} done",
    open: "Open",
  },
  detail: {
    back: "Back",
    done: "Done",
    notDone: "Not done",
    markDone: "Mark done",
    markNotDone: "Mark not done",
    updated: "Updated {when}",
    missing: "That item is gone.",
  },
};

export const SETTINGS_COPY = {
  title: "Settings",
  about: {
    title: "About",
    version: "Version {version}",
    versionUnknown: "Version unavailable",
  },
  actions: {
    title: "Account",
    empty: "Nothing to manage yet.",
  },
};

export const SHELL_COPY = {
  appName: "__PRODUCT_NAME__",
  pending: "Loading…",
  error: {
    title: "Something went wrong.",
    body: "Try again, or go back to where you were.",
    retry: "Try again",
    home: "Go home",
  },
  notFound: {
    title: "That page isn't here.",
    home: "Go home",
  },
};
