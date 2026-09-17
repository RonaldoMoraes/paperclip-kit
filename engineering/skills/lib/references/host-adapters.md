# Host adapters

Use this when a shared screen or component (`shared/ui`, or a shared feature surface)
needs data or actions from a host app (`apps/web`, `apps/mobile`).

## Position

Shared UI does not know the host's transport or query technology. Keep views testable by
passing concrete typed data, state flags, errors, and action callbacks.

Preferred shape:

1. The shared surface defines typed props for each exported screen or component — data
   in, callbacks out. Its types come from the contract (`@contracts/<feature>/…`), so the
   shape is the one the server honours.
2. The host owns routes, session, transport, cache, retries, and feature decisions.
3. A host adapter — the feature hook under `apps/<app>/src/features/<feature>/hooks/` —
   reads the contract's query, derives what the view reads, and hands typed data and
   actions to the surface. The route mounts the screen and passes what the hook returned.

```tsx
// apps/web/src/features/example/hooks/useExampleItems.ts — the adapter
export function useExampleItems() {
  const query = useQuery(listItemsQuery(http));
  const setDone = useMutation(setItemDoneMutation(http));
  return {
    items: query.data?.items ?? [],
    status: query.status,
    markDone: (id: string, done: boolean) => void setDone.mutate({ id, done }),
  };
}

// apps/web/src/app/routes/_app/example.index.tsx — the route
const { items, status, markDone } = useExampleItems();
return <ExampleList items={items} status={status} onToggle={markDone} />;
```

The hook returns only what the view reads — never the raw `useQuery`/`useMutation`
result, never `mutate`/`mutateAsync`/`refetch` themselves (`hook-narrow-return.grit`
errors on the rest). A screen or component never imports the query library, the
transport, the auth client, or a contract's runtime values (`server-state-boundary.grit`).

## Props vs a provider

Direct props are healthy when a host adapter maps data into the owning screen and that
screen passes each child only the subset it owns. It becomes prop drilling when
intermediate components forward the same unrelated props through several levels, when
sibling branches need the same actions, or when a spec must build a large prop tree to
exercise one nested component. Then propose a feature-owned provider — its value still
exposes data / state / actions, never query or mutation objects:

```ts
export type ExampleContract = {
  items: Item[];
  status: "pending" | "success" | "error";
  retry: () => void;
  markDone: (id: string, done: boolean) => void;
};
```

Names describe product behaviour and UI state: `items`, `isSaving`, `retry`,
`markDone` — never `itemsQuery`, `saveMutation`, `httpClient`.

## Refetch, retry and cache

Repeated refetching belongs in the host hook, not the shared view. Views know no cache
keys, query objects or mutation objects.

- independent data: mount the hooks together;
- dependent data: the query library's `enabled` option;
- repeated refresh: the query library's refetch options.

When a mutation returns the updated data, patch the query cache in the hook
(`setQueryData`) so the user sees the new state without a round-trip. Invalidate by the
feature's key when the response is not enough to patch safely, or when many queries are
affected. Do not fetch extra data on the server only to avoid an invalidation — the
response shape is a server design choice; pick the matching client strategy.

## Test boundary

- Shared surface specs render with props (or a provider value) holding data / state /
  actions. Query by testID.
- Hook specs mock the transport seam only (`fetch`/`http`, the auth client, timers).
  A hook spec that mocks more than the transport is a layering finding: extract first.
- Route specs assert dispatch: the right screen mounted with what the hook returned.
