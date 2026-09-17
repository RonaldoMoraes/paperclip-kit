# Worktrees and the `wt` CLI

The primary checkout stays on `__TRUNK__` and is never worked in: it is the base worktrees
are cut from and the source of the `.env` files. Every change is a worktree. An epic is a
worktree whose branch is the base for its sub-worktrees.

`wt` is the single entry point for that lifecycle and for running the stack.

```bash
yarn wt create <branch> [--from <base>] [--local]   # cut a branch and provision a worktree
yarn wt provision [--path <dir>]          # make an existing worktree usable
yarn wt run [--auto-db|--db] [--with <proc>] [--only ...]  # bring this worktree's stack up
yarn wt health                            # poll the stack until it answers
yarn wt stop [--drop-db]                  # stop the stack
yarn wt status                            # what is running here
yarn wt logs <proc>                       # attach to one process
yarn wt publish [--to <branch>]           # push the branch and open the PR
yarn wt dispose [--force]                 # remove the directory, keep the branch
```

Every command acts on the checkout the current directory belongs to. `create` runs in the
primary checkout; everything else runs inside a worktree — `cd` into it and work there.
Every command answers `--help`; `yarn wt help <command>` prints the same text.

`create` cuts from `origin/<base>` so the branch starts at the remote tip. `--local` cuts from
your local `<base>` branch instead — for example to test an unpushed local merge — and warns
when that branch is behind origin.

## Where the product is described

Everything `wt` knows about this product is one file, `scripts/wt/wt.config.sh`: the
trunk and the protected branches, the branch types and the ticket pattern, the database
(compose file, shared database name, URL key, schema directory, migrate and seed commands),
the dependency-sync rule, and the **process table** — one line per process with its
working directory, command, base port, health URL, `.env` file and the keys its overlay
rewrites. The libraries under `scripts/wt/lib/` never name the product; a new process or a
renamed trunk is a config edit, not a script edit.

## Prerequisites

- [overmind](https://github.com/DarthSim/overmind) and tmux — `wt run` drives the process
  stack through Overmind. `brew install overmind` on macOS, or
  `go install github.com/DarthSim/overmind/v2@latest`. Without it `wt run` refuses, prints
  the Procfile it would have started, and touches nothing.
- Docker — only when the product has a database: Postgres comes from
  `docker-compose.db.yml` at the repo root. A repo without that file has no database
  module, and `wt` skips every database step.
- `.env` files in the **primary checkout**: the root `.env` for the server and the web app,
  `apps/mobile/.env` for Metro. Provisioning symlinks every `.env` it finds into the
  worktree (`.env.example` excluded).

## Processes

`wt run` starts `server` (the API) and `web` (the web app) by default. `--with metro` adds
the mobile app's Metro — web developers never need it. `--only` replaces the default set
entirely:

```bash
yarn wt run                               # server + web
yarn wt run --with metro                  # + metro
yarn wt run --only web                    # web against mocks or an already-running server
```

`WT_RUN_FLAGS` holds the flags every `wt run` on a machine starts with — `export
WT_RUN_FLAGS="--with metro"` in a shell profile makes a shared launcher's plain `yarn wt run`
start Metro too. The flags are prepended, so the command line wins where two are exclusive.

## Slots and ports

Every app reads its port from its own `.env`, so two worktrees on the same app collide unless
each gets its own ports. Provisioning allocates a **slot** — the lowest free number from 1 to 9
— and persists it in `<worktree>/.wt/slot`; `create` provisions, so a worktree it made already
has one. Every port is `base + 10 × slot`.

Slot 0 is the primary checkout: the base ports themselves. It is never handed out to a
worktree, and `wt run` refuses to run in the primary checkout for that reason.

| Slot | server | web | metro |
| --- | --- | --- | --- |
| 0 (primary) | 3000 | 5173 | 8300 |
| 1 | 3010 | 5183 | 8310 |
| 2 | 3020 | 5193 | 8320 |
| 3 | 3030 | 5203 | 8330 |
| 4 | 3040 | 5213 | 8340 |
| 5 | 3050 | 5223 | 8350 |
| 6 | 3060 | 5233 | 8360 |
| 7 | 3070 | 5243 | 8370 |
| 8 | 3080 | 5253 | 8380 |
| 9 | 3090 | 5263 | 8390 |

The table is the config's arithmetic; `yarn wt status` prints the row for the worktree you
are in. Two `wt create` runs cannot claim the same slot: allocation is serialised by a lock
directory under the shared `.git`. A base port that another base's slot range would reach
is refused at startup, so no two processes can ever collide on any slot.

Postgres (5432) is shared by every slot — one container, many databases.

## `.env` overlays

Provisioning symlinks each `.env` in the worktree to the primary checkout's file. `wt run`
replaces the symlinks of the selected processes' `.env` files with a generated copy — the
primary's file with only the slot's keys overridden. Which keys is the last field of each
process line in `wt.config.sh`:

| File | Written for | Keys the overlay rewrites |
| --- | --- | --- |
| `.env` | `server` | `PORT` |
| `.env` | `web` | `VITE_DEV_PORT` |
| `apps/mobile/.env` | `metro` | `EXPO_PUBLIC_API_URL` (points at this slot's server) |
| the database env file | `--db` | `DATABASE_URL` (this worktree's own database) |

A key's template may name any process's slot port (`{server}`, `{web}`, …), this process's
(`{port}`) or the slot itself; `KEY=swap` instead rewrites every base port already inside
the key's value to the slot's — for a list of allowed origins that spans several apps, or a
single origin whose hostname must be kept.

`EXPO_PUBLIC_API_URL` is set to `http://localhost:<port>`, which resolves inside an iOS
simulator but not on an Android emulator (use `10.0.2.2`, or `adb reverse tcp:<port>
tcp:<port>`) or a physical device (use this machine's LAN address). Edit the generated file
after `wt run` for those.

Each generated file opens with `# generated by scripts/wt`. It is rewritten on every `wt run`,
so it cannot drift from the primary — **edit the primary checkout's `.env`, never the
worktree's copy**. Anything without that marker is treated as hand-written and left alone.
`wt stop` puts the symlinks back, and so does every failure path inside `wt run`.

### `.wt/`

Per-worktree state, gitignored:

| Entry | What |
| --- | --- |
| `slot` | the port slot |
| `base` | the ref the worktree was cut from (below) |
| `deps-state` | the commit of the last successful dependency sync |
| `Procfile`, `overmind.sock` | the running stack (the socket moves to `$TMPDIR/wt-<hash>.sock` when the worktree path is too long for a Unix socket) |
| `logs/` | install, migration and compose output, one file per step |
| `evidence/` | screenshots and recordings for the PR (below) |

### `.wt/base`

`create` records the ref it cut from in `<worktree>/.wt/base`. Two things read it: `wt run`
diffs against it to decide whether the branch touches the schema, and `wt publish` derives the
PR target from it. A worktree made by something else — a plain `git worktree add`, an editor's
worktree support — gets the base the creating tool left in `git config
branch.<name>.gh-merge-base` when there is one, and `origin/__TRUNK__` otherwise.

## Databases

By default every worktree shares the local `__DB_NAME__` database. A worktree whose branch
changes the schema directory (`db/prisma` by default — `WT_DB_SCHEMA_DIR`) gets its own
database on the same Postgres container, so its migrations never reach the shared one:

```bash
yarn wt run --db          # creates __DB_NAME___<branch-slug>, migrates, seeds, points the stack at it
yarn wt stop --drop-db    # stops the stack and drops that database
```

`wt run` refuses to start when the branch touches the schema directory and `--db` was not
passed. Pass `--shared-db` to override that deliberately, or `--auto-db` to let `wt run`
decide from the diff — own database when the branch touches the schema, the shared one
otherwise. `--auto-db` is what launchers that cannot know the branch use (editor worktree
hooks, agents); re-running it after a schema change moves the worktree onto its own database.

The shared database is migrated and seeded by `wt run` itself the first time it is found
empty (a fresh machine). A branch is on the shared database precisely because it does not
change the schema, so the migrations it applies are the trunk's. The migrate and seed
commands run inside the database workspace with the connection string exported under
`DATABASE_URL`; a fresh worktree also gets its generated client when the generated
directory is missing.

A repo without `docker-compose.db.yml` has no database module: `--db` and `--shared-db` are
refused with a plain message, `--auto-db` is ignored, and the preflight skips Docker.

## Publishing and disposing

`wt publish` targets the base recorded in `.wt/base` at create time, with any `origin/` prefix
stripped — so a worktree cut from an epic branch opens its PR into that epic, and everything
else into `__TRUNK__`. A recorded base that is a protected branch (`main`, `releases/*`) or a
missing base file falls back to `__TRUNK__`; `--to <branch>` overrides. The summary always
names the target before anything is pushed.

A `releases/*` base means a hotfix: the PR opens into `__TRUNK__`, and publish prints a
reminder to open the second PR into that release branch once the first merges.

It refuses a protected branch, a dirty tree, a detached HEAD, and a branch with nothing ahead
of the target. Then it prints a summary — branch, target, title, the commits, and whether
`origin/<target>` is an ancestor of HEAD — warns with a count when the branch is behind, and
asks for Enter before doing anything. `--yes` skips the prompt, and so does a non-interactive
stdin. `--draft` opens the PR as a draft.

The PR title comes from the branch name: `feat/ABC-1234-appointment-reminders` becomes
`feat(ABC-1234): appointment reminders`. A leading segment counts as a ticket only when it
matches `WT_TICKET_RE` — an uppercase key followed by a subject — so `chore/tidy-workspace`
becomes `chore: tidy workspace` and `feat/add-2-factor-auth` becomes `feat: add 2 factor auth`.

The body is `.github/PULL_REQUEST_TEMPLATE.md` by default, passed explicitly with
`--body-file`: GitHub applies that template to the web compose form but not to pull requests
opened through the API, so publish reads the file itself — fill the sections in on GitHub
afterwards. `--body-file <md>` sends a body already written along the template's sections
instead, which is how an agent that did the work describes it.

### Evidence

Evidence travels with the body. `--attach <file>[#alt text]`, repeatable, uploads screenshots
and recordings (PNG, JPEG, GIF, WebP, SVG, MP4, MOV, WebM; 10 MB, video up to 100 MB on paid
plans) through `gh pr create --attach` (gh 2.99.0+). A body that references a file as
`![alt](./path)` shows it in place; unreferenced files append at the end. Keep the files under
the worktree's `.wt/evidence/` — gitignored, so proof never enters the branch — and reference
them from there:

```bash
yarn wt publish --body-file .wt/pr.md \
  --attach '.wt/evidence/sign-in.png#Sign-in with the cooldown armed' \
  --attach .wt/evidence/checkout-return.mp4
```

When a PR is already open, the push updates it and CI re-runs; `--attach` then posts the
evidence (with `--body-file` as its text, if given) as a comment on that PR.

### Dispose

`wt dispose` removes the directory and keeps the branch — a feature branch lives until its
change is in production, because that is what a rollback is cut from. It refuses when there
are uncommitted changes or unpushed commits; `--force` discards the directory anyway.

Re-attaching a worktree to an existing branch later:

```bash
dir=${WT_WORKTREE_BASE:-$HOME/worktrees}/__PRODUCT_SLUG__-<branch-with-dashes>
git -C <primary> worktree add "$dir" <branch>
bash <primary>/scripts/wt/wt provision --path "$dir"
```

Provision is invoked from the primary checkout because a branch cut before the `wt` CLI landed
has no `scripts/wt` of its own.

`WT_WORKTREE_BASE` overrides where worktrees are created (default `~/worktrees`).

### Worktrees made by Claude Code

`.claude/settings.json` registers `WorktreeCreate` and `WorktreeRemove` hooks
(`.claude/hooks/worktree-create.sh`, `worktree-remove.sh`). A worktree Claude Code creates
(`claude --worktree <name>`, or an agent using its worktree isolation) is provisioned by
`wt provision` — `node_modules`, `.env` symlinks and a slot — and its stack is stopped before
Claude removes it. The branch Claude names (`worktree-<name>`) is not semantic; rename it
before `wt publish`.

Other tools create the worktree themselves and then provision it:

| Tool | How |
| --- | --- |
| Cursor | `.cursor/worktrees.json` runs `bash scripts/wt/wt provision` in the new worktree |
| Codex | `.codex/environments/environment.toml` runs `yarn wt provision` as the setup script |
| VS Code | No setup hook. After creating the worktree, run `bash scripts/wt/wt provision` inside it |
| Anything else | `yarn wt provision --path <dir>` from the primary checkout |

`yarn wt` needs an installed checkout — Yarn refuses to run a script where `node_modules`
is missing — so a fresh worktree's first command is `bash scripts/wt/wt provision`; from the
primary checkout, `yarn wt provision --path <dir>` is fine because the primary is installed.

## Output and logs

Installs, migrations and the Docker compose step are quiet: each prints one status line and
sends its output to `<worktree>/.wt/logs/<step>.log`. On failure the line turns into
`✗ <step> — see <log>` followed by the last 30 lines of that log, passwords in connection
strings masked. `WT_VERBOSE=1` streams everything to the terminal instead, and a plain
checkout (no `.wt/` to write into) always streams. Overmind's own process output under
`wt run` is untouched — that is what the terminal is for.

## What `wt run` does before it starts anything

1. **`.env` overlays** for the slot. They come first: the build inlines env values into the
   bundles, so they have to be in place before anything is built.
2. **Deps preflight** — `yarn install`, but only when it has to: when `yarn.lock`, any
   `package.json`, anything under `db/` or under a `prisma/` directory changed
   (`WT_DEPS_RELEVANT`) — either committed since the last successful run in this worktree,
   or sitting uncommitted in the working tree. It also syncs when `node_modules` is missing,
   when the worktree has no recorded marker yet, and when the recorded commit is no longer
   reachable (a rebase or force-push invalidates the marker). The marker is
   `<worktree>/.wt/deps-state`. `WT_SKIP_DEPS_SYNC=1` skips the step entirely;
   `WT_FORCE_DEPS_SYNC=1` syncs regardless of the diff.
3. **Preflight** — Docker up, `docker-compose.db.yml` up, Postgres ready, the database
   exists, `.env` sanity (CRLF endings, inline comments on the URL keys, a database URL
   pointing away from localhost), Overmind installed.
4. **Database** — migrates the worktree's own database (`--db`), or the shared one when it
   is still empty.
5. **Port cleanup** — reaps Overminds whose worktree was deleted from under them, then kills
   whatever still listens on the selected processes' ports (by port, never by name).
6. **Procfile + Overmind** — writes `<worktree>/.wt/Procfile` and starts Overmind on
   `<worktree>/.wt/overmind.sock`, so concurrent worktrees share neither. Stopping and
   orphan reaping find Overmind by the exact Procfile path in `ps` and kill by pid.

## Troubleshooting

### `wt run` says overmind is not installed

It printed the Procfile it would have started and changed nothing. Install Overmind (see
Prerequisites) and run again. Starting the processes by hand from that Procfile works but
binds the primary's ports — the overlays are only written by `wt run`.

### Overmind fails to start with `bind: invalid argument` on the socket

Unix socket paths cap at ~104 characters on macOS (108 on Linux). The socket lives at
`<worktree>/.wt/overmind.sock` when that fits and falls back to `$TMPDIR/wt-<hash>.sock`
when it does not, so this should not happen; when it still does, `TMPDIR` itself is too
long — export a short one (`/tmp`) or point `WT_WORKTREE_BASE` at a shallow directory.

### Preflight: `.env` issues — inline comment on the same line

A naive env parser takes everything after `=` as the value, so a trailing comment ends up
inside it:

```env
# BAD — the comment becomes part of the value
DATABASE_URL='postgresql://.../__DB_NAME__' # LOCAL

# GOOD
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/__DB_NAME__
```

Fix it in the **primary checkout's** `.env` — the overlays inherit whatever is there. CRLF
line endings fail the same check: `perl -pi -e 's/\r$//' .env` (portable; `sed -i` takes a
mandatory suffix argument on macOS).

### The server answers 500 right after a fresh run

The database exists but was never migrated. `wt run` migrates an empty database itself — the
worktree's own with `--db`, the shared one when it is found empty — so a plain re-run fixes
it. When a table is missing after that, the sentinel table the preflight checks
(`WT_DB_SENTINEL_TABLE`) exists while a newer migration does not: run with `--db` so the
branch's migrations land on the worktree's own database.

### Port already in use

`wt run` and `wt stop` clear stale listeners on the slot's ports themselves. When something
outside the slot holds one, find it with `lsof -i :<port>`.

### `overmind: it looks like Overmind is already running`

A socket left behind by a session that exited uncleanly. `wt run` and `wt stop` remove
`<worktree>/.wt/overmind.sock`; delete it by hand if it still trips you.

### Postgres crash loop / preflight hangs on Postgres

When Docker pulls a new Postgres major over a volume created by an older one, the container
refuses to start. Preflight detects this and prints the fix:

```bash
docker compose -f docker-compose.db.yml down -v
```

The volume is then empty — the next `yarn wt run` recreates and migrates the database it
needs.

### The first `wt run` in a new worktree is slow

It installs. Watch it with `yarn wt health` from another terminal; the captured output is in
`.wt/logs/`.

### A worktree that was deleted without `wt stop`

Its Overmind is still running and holds the slot's ports. The next `wt run` in any worktree
reaps it (its Procfile is gone). To do it by hand: `yarn wt status` in a live worktree lists
nothing for it; find the listener with `lsof -i :<port>` and stop that Overmind.
