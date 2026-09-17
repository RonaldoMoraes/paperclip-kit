# Stories

Use this when authoring or changing Storybook stories for `shared/ui` (or a shared
feature surface). Storybook is optional in the kit; when the product adds it, this is how
stories are written.

## What a story is for

1. **The visual catalog.** Designers, product and engineers review a primitive in each
   meaningful state without running an app. The story is the canonical record of what a
   component looks like when X.
2. **Agentic UI work.** An agent about to change a primitive reads its stories to learn
   the props, the supported states and the existing visual language before touching it.

Both collapse if stories are stale, missing, or model behaviour that belongs in specs.
A story is a static entry, not a behaviour simulator: no `play` interaction tests, no
cross-screen flows, no story-managed journeys.

## Placement and naming

Beside the component: `shared/ui/components/Button.tsx` → `Button.stories.tsx`. A
Storybook-only folder holds shared story helpers or preview wrappers — never the stories.

```ts
const meta = {
  title: "UI/Primitives/Button",
  component: Button,
} satisfies Meta<typeof Button>;
```

`UI/Primitives/<Component>` for `shared/ui`, `<Feature>/Screens/<Screen>` for a feature
surface. Pick a depth that reads in the sidebar.

## Coverage

One story per state the component is designed to show — default, each `variant`, each
`tone`, disabled, loading, error, empty, the longest realistic content. Do not pad with
stories that differ by an irrelevant prop.

## `argTypes`

Expose the props that change the rendering, each with a one-line `description` so the
docs panel answers prop questions without a source dive. Pull option lists into a typed
`const … = [...] as const` shared with the component's types.

## Wrappers and data

Wrap a screen in a decorator that matches its real layout container (phone width first).
Data reaches a story as `args` or a decorator-level provider value built from the same
fixture the specs use (`apps/web/src/testing/seeds.ts` holds plain data for this reason)
— never the host's real hook or transport.

## Accessibility is part of the story

A primitive's story shows the focus ring, the 44px target, the disabled treatment — the
things `docs/ui.md` says live in the primitive. A story that hides them is documenting
the wrong thing.
