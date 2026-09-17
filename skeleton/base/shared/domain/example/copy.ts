/**
 * The example feature's copy — every word its two screens print, under keys the screens
 * read by path (`EXAMPLE_COPY.detail.markDone`). PLACEHOLDER WORDING: the product replaces
 * the values; the keys are what web and mobile share, and every key here is read by both.
 */
export const EXAMPLE_COPY = {
  list: {
    eyebrow: "Example",
    title: "Your *items*",
    body: "Everything on the list, the open ones first.",
    filters: { all: "All", open: "Open", done: "Done" },
    empty: { title: "Nothing here.", body: "No item matches this filter." },
    emptyCta: "Show everything",
    lastVisited: "Last opened",
    doneMark: "Done",
  },
  detail: {
    back: "Back",
    status: { done: "Done", open: "Open" },
    markDone: "Mark done",
    markOpen: "Mark open",
    updated: "Updated {when}",
    refused: "That item can't be changed right now.",
  },
};
