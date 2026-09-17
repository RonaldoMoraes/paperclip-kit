# `.spec/` — plans not yet built

Everything here is future tense: a design, a plan, an open decision, a backlog. `docs/`
is present tense and describes what the code does; the moment a document here starts
describing what *is*, it either moves to `docs/` (if the code cannot say it) or is
deleted (if the code now says it).

## Layout

```
.spec/
├── README.md                       # this file
└── <domain>/                       # one directory per area of work (onboarding, billing, worktree, …)
    ├── plan.md                     # or design.md, spec.md — the shape of the work
    └── tasks/                      # optional: one self-contained file per task
        ├── README.md               # the task index; maps task ↔ ticket when a tracker exists
        └── <ID>-<slug>.md
```

## The header

Every plan opens with a status line, so a reader knows whether it is live without asking:

```
Status: in progress · delete when the last task ships
```

`Status:` values are free text but keep the verbs honest — *proposed*, *approved*,
*in progress*, *blocked on <x>*. A plan with no status line is a draft nobody owns.

## The task-file pattern

A task file is written to be finished without opening anything else: every data table and
rule it needs is inlined, with the source cited for provenance. It says which layers it
touches (contract → server → screen → tests), what mock-mode state makes it QA-walkable,
and its definition of done. When the task is mirrored in a tracker, **the repo file is
authoritative** — sync edits both ways, and say so in the index.

## Deleted when shipped

A plan whose last task is merged is deleted in the same PR, not archived. The PR
description carries the story of what was tried and why; the code carries the result;
`docs/` carries what the code cannot say. Nothing else needs to remember.
