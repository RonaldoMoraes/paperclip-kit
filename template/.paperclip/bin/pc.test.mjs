// Tests for pc — the Paperclip coordination ledger.
//
//   node --test .paperclip/bin/pc.test.mjs
//
// Every test runs against its own throwaway ledger. Set PC_TEST_ROOT to put those
// under a directory you can inspect afterwards; otherwise they go to the OS temp dir
// and are cleaned up.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  appendNote,
  createRecord,
  globsOverlap,
  parseFrontmatter,
  slugify,
  stringifyDoc,
} from './pc.mjs';

const BIN_DIR = dirname(fileURLToPath(import.meta.url));
const PC_MJS = join(BIN_DIR, 'pc.mjs');
const PC_SH = join(BIN_DIR, 'pc');
const SEED_LOG = join(BIN_DIR, '..', 'log', 'tasks.jsonl');

const TEST_ROOT = process.env.PC_TEST_ROOT
  ? (mkdirSync(process.env.PC_TEST_ROOT, { recursive: true }), process.env.PC_TEST_ROOT)
  : tmpdir();
const created = [];

/** A fresh repo with an empty .paperclip/ ledger. Returns its root. */
function makeRepo(seedLog = false) {
  const root = mkdtempSync(join(TEST_ROOT, 'pc-test-'));
  created.push(root);
  for (const d of ['campaigns', 'work', 'findings', 'log', 'research', 'contracts']) {
    mkdirSync(join(root, '.paperclip', d), { recursive: true });
  }
  if (seedLog && existsSync(SEED_LOG)) {
    copyFileSync(SEED_LOG, join(root, '.paperclip', 'log', 'tasks.jsonl'));
  }
  return root;
}

after(() => {
  if (process.env.PC_KEEP_TEST_DIRS === '1') return;
  for (const d of created) rmSync(d, { recursive: true, force: true });
});

/** Run pc the way a user does, in `cwd`. */
function pc(cwd, args, opts = {}) {
  const r = spawnSync(process.execPath, [PC_MJS, ...args], {
    cwd,
    encoding: 'utf8',
    input: opts.input ?? '',
    env: { ...process.env, PAPERCLIP_DIR: '', ...(opts.env || {}) },
  });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

function ok(cwd, args, opts) {
  const r = pc(cwd, args, opts);
  assert.equal(r.code, 0, `pc ${args.join(' ')} exited ${r.code}\nstdout: ${r.out}\nstderr: ${r.err}`);
  return r;
}

const idFrom = (stdout, prefix) => stdout.match(new RegExp(`${prefix}-\\d{4}-[a-z0-9-]+`))?.[0];

function newTask(root, title, extra = []) {
  const r = ok(root, ['task', 'new', title, '--class', 'module-build', '--role', 'engineer', ...extra]);
  const id = idFrom(r.out, 'w');
  assert.ok(id, `no task id in: ${r.out}`);
  return id;
}

function taskFile(root, id) {
  return join(root, '.paperclip', 'work', `${id}.md`);
}

function newCampaign(root, title, extra = []) {
  const r = ok(root, ['campaign', 'new', title, ...extra]);
  const id = idFrom(r.out, 'c');
  assert.ok(id, `no campaign id in: ${r.out}`);
  return id;
}

function campaignFile(root, id) {
  return join(root, '.paperclip', 'campaigns', `${id}.md`);
}

/** A task with an explicit scope — the shape every campaign task should have. */
function scopedTask(root, title, globs, extra = []) {
  const scopeArgs = globs.flatMap((g) => ['--scope', g]);
  return newTask(root, title, [...scopeArgs, ...extra]);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('helpers', () => {
  it('slugify makes a short, file-safe slug', () => {
    assert.equal(slugify('Build the payments-stripe module'), 'build-the-payments-stripe-module');
    assert.equal(slugify('   !!!   '), 'untitled');
    assert.ok(slugify('a'.repeat(200)).length <= 48);
  });

  it('frontmatter round-trips scalars, block lists and inline lists', () => {
    const text = [
      '---',
      'id: w-0001-x',
      'status: queued',
      'scope:',
      '  - a/**',
      '  - b/**',
      'gates: [typecheck, lint]',
      '---',
      '## Goal',
      'hello',
      '',
    ].join('\n');
    const { data, body } = parseFrontmatter(text);
    assert.equal(data.id, 'w-0001-x');
    assert.deepEqual(data.scope, ['a/**', 'b/**']);
    assert.deepEqual(data.gates, ['typecheck', 'lint']);
    assert.match(body, /^## Goal/);
    assert.equal(stringifyDoc(data, body, ['id', 'status', 'scope', 'gates']), text);
  });

  it('frontmatter survives hand edits: sloppy spacing, quotes, comments, unknown keys', () => {
    const { data } = parseFrontmatter(
      [
        '---',
        'id:   w-0009-hand-edited',
        "title: 'Quoted title'",
        'status: blocked   # the founder is deciding',
        'blocked_on: founder',
        'nonsense line without a colon',
        'my_own_key: kept',
        '---',
        'body',
      ].join('\n'),
    );
    assert.equal(data.id, 'w-0009-hand-edited');
    assert.equal(data.title, 'Quoted title');
    assert.equal(data.status, 'blocked');
    assert.equal(data.my_own_key, 'kept');
  });

  it('a file with no frontmatter is body, not a crash', () => {
    const { data, body } = parseFrontmatter('just some notes\n');
    assert.deepEqual(data, {});
    assert.equal(body, 'just some notes\n');
  });
});

describe('id sequencing', () => {
  it('numbers tasks and findings from 0001 upward', () => {
    const root = makeRepo();
    assert.match(newTask(root, 'first'), /^w-0001-first$/);
    assert.match(newTask(root, 'second'), /^w-0002-second$/);
    assert.match(newTask(root, 'third'), /^w-0003-third$/);
  });

  it('skips a sequence number already used by a different slug', () => {
    const root = makeRepo();
    newTask(root, 'first');
    writeFileSync(join(root, '.paperclip', 'work', 'w-0002-created-by-hand.md'), '---\nid: w-0002-created-by-hand\n---\n');
    assert.match(newTask(root, 'second'), /^w-0003-second$/);
  });

  it('retries when another process takes the id between the scan and the write', () => {
    const root = makeRepo();
    const dir = join(root, '.paperclip', 'work');
    createRecord(dir, 'w', 'first', '---\nid: __PC_ID__\n---\n');

    const raced = [];
    const { id } = createRecord(dir, 'w', 'second', '---\nid: __PC_ID__\n---\n', {
      beforeCreate({ id: attemptId, file, attempt }) {
        raced.push(attemptId);
        // Simulate a concurrent agent claiming this exact id first.
        if (attempt === 0) writeFileSync(file, 'taken by another agent\n');
      },
    });
    assert.deepEqual(raced, ['w-0002-second', 'w-0003-second'], 'should have retried once');
    assert.equal(id, 'w-0003-second');
    assert.equal(readFileSync(join(dir, 'w-0002-second.md'), 'utf8'), 'taken by another agent\n');
  });
});

describe('task transitions', () => {
  it('new → start → done records a duration in the log', () => {
    const root = makeRepo();
    const id = newTask(root, 'ship the thing', ['--scope', 'a/**', '--gates', 'typecheck,test']);
    const file = taskFile(root, id);
    assert.match(readFileSync(file, 'utf8'), /status: queued/);

    ok(root, ['task', 'start', id, '--owner', 'agent:t1']);
    const started = readFileSync(file, 'utf8');
    assert.match(started, /status: running/);
    assert.match(started, /owner: agent:t1/);
    assert.match(started, /started: \d{4}-\d{2}-\d{2}T/);

    const done = ok(root, ['task', 'done', id]);
    assert.match(done.out, /done/);
    const doneText = readFileSync(file, 'utf8');
    assert.match(doneText, /status: done/);
    assert.match(doneText, /ended: \d{4}-\d{2}-\d{2}T/);

    const rows = readFileSync(join(root, '.paperclip', 'log', 'tasks.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, id);
    assert.equal(rows[0].class, 'module-build');
    assert.equal(rows[0].status, 'done');
    assert.equal(typeof rows[0].duration_s, 'number');
    assert.deepEqual(rows[0].gates_passed, ['typecheck', 'test']);
    assert.equal(rows[0].findings_raised, 0);
    for (const k of ['tokens', 'tool_uses']) assert.ok(k in rows[0], `log row is missing ${k}`);
  });

  it('done twice is not an error — it says so and does not double-log', () => {
    const root = makeRepo();
    const id = newTask(root, 'idempotent');
    ok(root, ['task', 'start', id]);
    ok(root, ['task', 'done', id]);
    const second = ok(root, ['task', 'done', id]);
    assert.match(second.out, /already done/);
    const lines = readFileSync(join(root, '.paperclip', 'log', 'tasks.jsonl'), 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
  });

  it('fail records a failed row and can be restarted', () => {
    const root = makeRepo();
    const id = newTask(root, 'flaky');
    ok(root, ['task', 'start', id]);
    ok(root, ['task', 'fail', id, '--note', 'typecheck exploded']);
    assert.match(readFileSync(taskFile(root, id), 'utf8'), /status: failed/);
    assert.match(readFileSync(taskFile(root, id), 'utf8'), /typecheck exploded/);
    const row = JSON.parse(readFileSync(join(root, '.paperclip', 'log', 'tasks.jsonl'), 'utf8').trim());
    assert.equal(row.status, 'failed');

    const restart = ok(root, ['task', 'start', id]);
    assert.match(restart.out, /restarted/);
    assert.match(readFileSync(taskFile(root, id), 'utf8'), /status: running/);
  });

  it('block requires --on, and records what it is blocked on', () => {
    const root = makeRepo();
    const id = newTask(root, 'needs the auth seam');

    const missing = pc(root, ['task', 'block', id]);
    assert.equal(missing.code, 2);
    assert.match(missing.err, /--on/);

    ok(root, ['task', 'block', id, '--on', 'founder', '--note', 'waiting on a pricing call']);
    const text = readFileSync(taskFile(root, id), 'utf8');
    assert.match(text, /status: blocked/);
    assert.match(text, /blocked_on: founder/);
    assert.match(text, /waiting on a pricing call/);

    const again = ok(root, ['task', 'block', id, '--on', 'founder']);
    assert.match(again.out, /already blocked/);
  });

  it('block --on rejects a finding id that does not exist', () => {
    const root = makeRepo();
    const id = newTask(root, 'blocked on nothing');
    const r = pc(root, ['task', 'block', id, '--on', 'f-9999-nope']);
    assert.equal(r.code, 1);
    assert.match(r.err, /neither "founder" nor a known finding/);
  });

  it('unblock returns a started task to running and an unstarted one to queued', () => {
    const root = makeRepo();
    const queuedId = newTask(root, 'never started');
    ok(root, ['task', 'block', queuedId, '--on', 'founder']);
    ok(root, ['task', 'unblock', queuedId]);
    assert.match(readFileSync(taskFile(root, queuedId), 'utf8'), /status: queued/);
    assert.doesNotMatch(readFileSync(taskFile(root, queuedId), 'utf8'), /blocked_on/);

    const runningId = newTask(root, 'was running');
    ok(root, ['task', 'start', runningId]);
    ok(root, ['task', 'block', runningId, '--on', 'founder']);
    ok(root, ['task', 'unblock', runningId]);
    assert.match(readFileSync(taskFile(root, runningId), 'utf8'), /status: running/);

    const noop = ok(root, ['task', 'unblock', runningId]);
    assert.match(noop.out, /not blocked/);
  });

  it('start on a done task is refused with a useful message', () => {
    const root = makeRepo();
    const id = newTask(root, 'finished');
    ok(root, ['task', 'start', id]);
    ok(root, ['task', 'done', id]);
    const r = pc(root, ['task', 'start', id]);
    assert.equal(r.code, 1);
    assert.match(r.err, /is done/);
  });
});

describe('notes', () => {
  it('appends in order and never loses an existing line', () => {
    const root = makeRepo();
    const id = newTask(root, 'note taker');
    const file = taskFile(root, id);
    const before = readFileSync(file, 'utf8');

    ok(root, ['task', 'note', id, 'first observation']);
    ok(root, ['task', 'note', id, 'second observation']);
    ok(root, ['task', 'start', id, '--note', 'third observation']);
    ok(root, ['task', 'note', id, 'fourth observation']);

    const after = readFileSync(file, 'utf8');
    for (const line of before.split('\n').filter((l) => l.trim() && !l.startsWith('status:'))) {
      assert.ok(after.includes(line), `lost a pre-existing line: ${line}`);
    }
    const order = ['first', 'second', 'third', 'fourth'].map((w) => after.indexOf(`${w} observation`));
    assert.ok(order.every((i) => i > -1), 'every note should be present');
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'notes must stay in order, oldest first');
    assert.match(after, /- \d{4}-\d{2}-\d{2}T[\d:]+Z — first observation/);
  });

  it('appends at the end of ## Notes even when a human added a section after it', () => {
    const root = makeRepo();
    const id = newTask(root, 'hand edited');
    const file = taskFile(root, id);
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n## Founder's aside\nkeep me\n`);
    ok(root, ['task', 'note', id, 'spliced in']);
    const text = readFileSync(file, 'utf8');
    assert.ok(text.includes('keep me'), 'the human-added section must survive');
    assert.ok(text.indexOf('spliced in') < text.indexOf("## Founder's aside"), 'note belongs in ## Notes');
  });

  it('creates ## Notes when the file has none', () => {
    const root = makeRepo();
    const file = join(root, '.paperclip', 'work', 'w-0001-bare.md');
    writeFileSync(file, '---\nid: w-0001-bare\nstatus: queued\n---\n## Goal\nsomething\n');
    appendNote(file, 'hello');
    const text = readFileSync(file, 'utf8');
    assert.match(text, /## Notes/);
    assert.match(text, /— hello/);
  });
});

describe('findings', () => {
  it('runs the full lifecycle: new → claim → fix', () => {
    const root = makeRepo();
    const taskId = newTask(root, 'payments stripe');
    const fixerId = newTask(root, 'auth seams');

    const created = ok(root, [
      'finding', 'new',
      '--from', taskId,
      '--area', 'skeleton/modules/auth-better-auth',
      '--severity', 'blocker',
      '--title', 'Narrow session strips extras',
    ], { input: 'Calling narrowSession() drops the fields the stripe module needs.\n' });
    const fid = idFrom(created.out, 'f');
    assert.equal(fid, 'f-0001-narrow-session-strips-extras');

    const file = join(root, '.paperclip', 'findings', `${fid}.md`);
    const initial = readFileSync(file, 'utf8');
    assert.match(initial, /status: open/);
    assert.match(initial, /severity: blocker/);
    assert.match(initial, new RegExp(`raised_by: ${taskId}`));
    assert.match(initial, /owner_area: skeleton\/modules\/auth-better-auth/);
    assert.match(initial, /narrowSession\(\) drops the fields/);
    assert.match(initial, /## What/);
    assert.match(initial, /## Evidence/);
    assert.match(initial, /## Suggested fix/);

    ok(root, ['finding', 'claim', fid, '--by', fixerId]);
    const claimed = readFileSync(file, 'utf8');
    assert.match(claimed, /status: claimed/);
    assert.match(claimed, new RegExp(`owner_task: ${fixerId}`));

    assert.match(ok(root, ['finding', 'claim', fid, '--by', fixerId]).out, /already claimed/);

    const other = newTask(root, 'someone else');
    const conflict = pc(root, ['finding', 'claim', fid, '--by', other]);
    assert.equal(conflict.code, 1, 'claiming a claimed finding is a real conflict');
    assert.match(conflict.err, /--force/);
    ok(root, ['finding', 'claim', fid, '--by', other, '--force']);
    assert.match(readFileSync(file, 'utf8'), new RegExp(`owner_task: ${other}`));

    ok(root, ['finding', 'fix', fid, '--note', 'widened the session type']);
    const fixed = readFileSync(file, 'utf8');
    assert.match(fixed, /status: fixed/);
    assert.match(fixed, /widened the session type/);
    assert.match(ok(root, ['finding', 'fix', fid]).out, /already fixed/);
  });

  it('close --reason marks it wontfix and keeps the reason', () => {
    const root = makeRepo();
    const taskId = newTask(root, 'raiser');
    const fid = idFrom(
      ok(root, ['finding', 'new', '--from', taskId, '--area', 'skeleton/base', '--severity', 'nit', '--title', 'Trailing whitespace']).out,
      'f',
    );
    const missing = pc(root, ['finding', 'close', fid]);
    assert.equal(missing.code, 2);
    assert.match(missing.err, /--reason/);

    ok(root, ['finding', 'close', fid, '--reason', 'biome already formats this']);
    const text = readFileSync(join(root, '.paperclip', 'findings', `${fid}.md`), 'utf8');
    assert.match(text, /status: wontfix/);
    assert.match(text, /biome already formats this/);
  });

  it('finding new validates severity and requires --from/--area', () => {
    const root = makeRepo();
    const taskId = newTask(root, 'raiser');
    const bad = pc(root, ['finding', 'new', '--from', taskId, '--area', 'x', '--severity', 'catastrophe', '--title', 't']);
    assert.equal(bad.code, 2);
    assert.match(bad.err, /blocker \| defect \| nit/);
    assert.equal(pc(root, ['finding', 'new', '--area', 'x', '--severity', 'nit', '--title', 't']).code, 2);
  });

  it('finding list filters by status and area', () => {
    const root = makeRepo();
    const t = newTask(root, 'raiser');
    ok(root, ['finding', 'new', '--from', t, '--area', 'mod/a', '--severity', 'defect', '--title', 'A breaks']);
    const second = idFrom(
      ok(root, ['finding', 'new', '--from', t, '--area', 'mod/b', '--severity', 'nit', '--title', 'B is untidy']).out,
      'f',
    );
    ok(root, ['finding', 'close', second, '--reason', 'not worth it']);

    const openOnly = JSON.parse(ok(root, ['finding', 'list', '--status', 'open', '--json']).out);
    assert.equal(openOnly.length, 1);
    assert.equal(openOnly[0].owner_area, 'mod/a');

    const byArea = JSON.parse(ok(root, ['finding', 'list', '--area', 'mod/b', '--json']).out);
    assert.equal(byArea.length, 1);
    assert.equal(byArea[0].status, 'wontfix');
  });
});

describe('scope overlap', () => {
  it('decides overlap from the literal head of the glob, and leans to yes', () => {
    // Overlapping — the answer that costs a --force when it is wrong.
    for (const [a, b] of [
      ['a/**', 'a/b/c.ts'],
      ['a/b/**', 'a/**'],
      ['a/**', 'a/**'],
      ['a/b/c.ts', 'a/b/c.ts'],
      ['a/b', 'a/b/c.ts'], // a literal path may be the directory above the other
      ['a/*/c.ts', 'a/b/d.ts'], // conservative: neither head reaches the difference
      ['**/*.spec.ts', 'anything/at/all.ts'], // a leading wildcard claims everything
      ['./a/b/**', 'a/b/'], // normalised: leading ./ and trailing / mean nothing
      ['a/B/**', 'a/b/c.ts'], // one file on a case-insensitive filesystem
    ]) {
      assert.equal(globsOverlap(a, b), true, `${a} should overlap ${b}`);
      assert.equal(globsOverlap(b, a), true, `${b} should overlap ${a} (it is symmetric)`);
    }
    // Separate — only a divergence between two literal segments proves it.
    for (const [a, b] of [
      ['a/b/**', 'a/c/**'],
      ['a/b/c.ts', 'a/b/d.ts'],
      ['apps/web/**', 'apps/server/**'],
      ['a/b.ts', 'a/b.ts.map'],
    ]) {
      assert.equal(globsOverlap(a, b), false, `${a} must not overlap ${b}`);
      assert.equal(globsOverlap(b, a), false, `${b} must not overlap ${a}`);
    }
  });

  it('refuses a second writer in either direction, naming the task and the globs', () => {
    const root = makeRepo();
    const wide = scopedTask(root, 'wide', ['a/**']);

    const narrow = pc(root, [
      'task', 'new', 'narrow', '--class', 'module-build', '--role', 'engineer',
      '--scope', 'a/b/c.ts',
    ]);
    assert.equal(narrow.code, 1);
    assert.match(narrow.err, /scope overlap/);
    assert.match(narrow.err, new RegExp(`${wide} \\(queued\\)`), 'the refusal must name the task it collides with');
    assert.match(narrow.err, /a\/b\/c\.ts {2}overlaps {2}a\/\*\*/, 'the refusal must name both globs');
    assert.match(narrow.err, /--force/);
    assert.equal(readdirSync(join(root, '.paperclip', 'work')).length, 1, 'nothing may be created on a refusal');

    // The other direction: the narrow claim exists first, the wide one is refused.
    const root2 = makeRepo();
    scopedTask(root2, 'narrow', ['a/b/c.ts']);
    const wider = pc(root2, [
      'task', 'new', 'wide', '--class', 'module-build', '--role', 'engineer', '--scope', 'a/**',
    ]);
    assert.equal(wider.code, 1);
    assert.match(wider.err, /a\/\*\* {2}overlaps {2}a\/b\/c\.ts/);

    // Identical globs are the same claim twice.
    const root3 = makeRepo();
    scopedTask(root3, 'first', ['apps/web/src/**']);
    assert.equal(
      pc(root3, ['task', 'new', 'second', '--class', 'x', '--role', 'engineer', '--scope', 'apps/web/src/**']).code,
      1,
    );

    // Siblings are the whole point of a partition: they must go through.
    const root4 = makeRepo();
    scopedTask(root4, 'web', ['apps/web/**']);
    scopedTask(root4, 'server', ['apps/server/**']);
    scopedTask(root4, 'mobile', ['apps/mobile/**', 'shared/ui/mobile/**']);
    assert.equal(readdirSync(join(root4, '.paperclip', 'work')).filter((f) => f.endsWith('.md')).length, 3);
  });

  it('a finished task no longer owns its scope', () => {
    const root = makeRepo();
    const first = scopedTask(root, 'first pass', ['a/**']);
    assert.equal(
      pc(root, ['task', 'new', 'second pass', '--class', 'x', '--role', 'engineer', '--scope', 'a/**']).code,
      1,
      'while it is queued the scope is taken',
    );
    ok(root, ['task', 'start', first]);
    ok(root, ['task', 'done', first]);
    const second = scopedTask(root, 'second pass', ['a/**']);
    assert.ok(second, 'once the first is done the paths are free again');

    // A failed task is finished too; a blocked one is not.
    const third = scopedTask(root, 'third pass', ['b/**']);
    ok(root, ['task', 'block', third, '--on', 'founder']);
    assert.equal(
      pc(root, ['task', 'new', 'fourth', '--class', 'x', '--role', 'engineer', '--scope', 'b/**']).code,
      1,
      'a blocked task still owns its scope',
    );
  });

  it('--force creates it and records the accepted overlap in the notes of BOTH tasks', () => {
    const root = makeRepo();
    const first = scopedTask(root, 'owner of the tree', ['a/**']);
    const forced = ok(root, [
      'task', 'new', 'deliberate second writer', '--class', 'module-build', '--role', 'engineer',
      '--scope', 'a/b/c.ts', '--force',
    ]);
    const second = idFrom(forced.out, 'w');
    assert.match(forced.out, /overlap with .* accepted \(--force\)/);

    const theirs = readFileSync(taskFile(root, first), 'utf8');
    const mine = readFileSync(taskFile(root, second), 'utf8');
    assert.match(mine, new RegExp(`scope overlap with ${first} accepted deliberately \\(--force\\)`));
    assert.match(mine, /a\/b\/c\.ts overlaps a\/\*\*/);
    assert.match(theirs, new RegExp(`scope overlap with ${second} accepted deliberately \\(--force\\)`));
    assert.match(theirs, /a\/\*\* overlaps a\/b\/c\.ts/);
  });

  it('warns — and does not refuse — when a task claims no scope at all', () => {
    const root = makeRepo();
    const r = pc(root, ['task', 'new', 'claims nothing', '--class', 'doc-pass', '--role', 'engineer']);
    assert.equal(r.code, 0, 'a scopeless task is a warning, not a refusal');
    assert.match(r.err, /no --scope/);
    assert.match(r.err, /claims no paths/);
    assert.doesNotMatch(r.out, /⚠/, 'the warning belongs on stderr, so --json stays pure');
    assert.doesNotThrow(
      () => JSON.parse(pc(root, ['task', 'new', 'also nothing', '--class', 'doc-pass', '--role', 'engineer', '--json']).out),
      '--json output must not be polluted by the warning',
    );
  });

  it('pc scope check gives the same answer task new does, before anything exists', () => {
    const root = makeRepo();
    scopedTask(root, 'web surface', ['apps/web/**', 'shared/ui/**']);

    const clear = ok(root, ['scope', 'check', 'apps/server/**']);
    assert.match(clear.out, /no overlap/);

    const collides = pc(root, ['scope', 'check', 'apps/web/src/routes/plan.tsx']);
    assert.equal(collides.code, 1, 'an overlap exits non-zero so a script can branch on it');
    assert.match(collides.out, /scope overlap/);
    assert.match(collides.out, /apps\/web\/src\/routes\/plan\.tsx {2}overlaps {2}apps\/web\/\*\*/);

    const data = JSON.parse(pc(root, ['scope', 'check', 'shared/ui/button.tsx', '--json']).out);
    assert.equal(data.clear, false);
    assert.equal(data.conflicts[0].overlaps[0].claimed_by_them, 'shared/ui/**');

    // The two must never disagree: whatever check says, task new does.
    for (const glob of ['apps/web/**', 'apps/web/src/x.ts', 'apps/server/**', 'shared/ui/a/b.ts', 'docs/**']) {
      const checked = pc(root, ['scope', 'check', glob]).code === 0;
      const created = pc(root, ['task', 'new', `probe ${glob}`, '--class', 'x', '--role', 'engineer', '--scope', glob]);
      assert.equal(created.code === 0, checked, `scope check and task new disagree about ${glob}`);
      if (created.code === 0) {
        const id = idFrom(created.out, 'w');
        ok(root, ['task', 'start', id]);
        ok(root, ['task', 'done', id]); // finish it so the next probe starts from the same state
      }
    }

    assert.equal(pc(root, ['scope', 'check']).code, 2, 'check with no glob is a usage error');
  });
});

describe('campaigns', () => {
  it('new writes the file, attaches tasks, and show reads membership from the ledger', () => {
    const root = makeRepo();
    const cid = newCampaign(root, 'Port the plan flow', ['--contract', '.paperclip/contracts/plan-flow.md']);
    assert.match(cid, /^c-0001-port-the-plan-flow$/);

    const text = readFileSync(campaignFile(root, cid), 'utf8');
    assert.match(text, /status: running/);
    assert.match(text, /contract: \.paperclip\/contracts\/plan-flow\.md/);
    assert.match(text, /started: \d{4}-\d{2}-\d{2}T/);
    for (const heading of ['## Goal', '## Tasks', '## Notes']) {
      assert.ok(text.includes(heading), `the campaign file needs ${heading}`);
    }

    const inside = scopedTask(root, 'web screens', ['apps/web/**'], ['--campaign', cid]);
    const alsoInside = scopedTask(root, 'server endpoints', ['apps/server/**'], ['--campaign', 'c-0001']); // bare id
    const outside = scopedTask(root, 'unrelated chore', ['docs/**']);
    assert.match(readFileSync(taskFile(root, inside), 'utf8'), new RegExp(`campaign: ${cid}`));

    const shown = JSON.parse(ok(root, ['campaign', 'show', cid, '--json']).out);
    assert.equal(shown.counts.total, 2, 'only its own tasks belong to it');
    assert.deepEqual(shown.tasks.map((t) => t.id).sort(), [inside, alsoInside].sort());
    assert.ok(!shown.tasks.some((t) => t.id === outside), 'an unattached task is not a member');

    const listed = JSON.parse(ok(root, ['campaign', 'list', '--json']).out);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].status, 'running');
    assert.equal(listed[0].counts.queued, 2);

    assert.equal(pc(root, ['task', 'new', 'x', '--class', 'c', '--role', 'r', '--campaign', 'c-9999']).code, 1);
    assert.match(
      pc(root, ['task', 'new', 'x', '--class', 'c', '--role', 'r', '--campaign', 'c-9999']).err,
      /no campaign matching/,
    );
  });

  it('close refuses while a task is unfinished, listing exactly what is open', () => {
    const root = makeRepo();
    const cid = newCampaign(root, 'Half done');
    const a = scopedTask(root, 'finished piece', ['a/**'], ['--campaign', cid]);
    const b = scopedTask(root, 'unfinished piece', ['b/**'], ['--campaign', cid]);
    ok(root, ['task', 'start', a]);
    ok(root, ['task', 'done', a]);
    ok(root, ['task', 'start', b]);

    const r = pc(root, ['campaign', 'close', cid]);
    assert.equal(r.code, 1);
    assert.match(r.err, /still has open work/);
    assert.match(r.err, /tasks not done or failed \(1\)/);
    assert.ok(r.err.includes(b), 'the refusal names the unfinished task');
    assert.ok(!r.err.includes(a), 'a finished task is not listed as open work');
    assert.match(readFileSync(campaignFile(root, cid), 'utf8'), /status: running/, 'a refused close changes nothing');
  });

  it('close refuses while a finding one of its tasks raised is still open', () => {
    const root = makeRepo();
    const cid = newCampaign(root, 'Raised a defect');
    const a = scopedTask(root, 'raiser', ['a/**'], ['--campaign', cid]);
    const fid = idFrom(
      ok(root, ['finding', 'new', '--from', a, '--area', 'b/**', '--severity', 'blocker', '--title', 'Seam is wrong']).out,
      'f',
    );
    ok(root, ['task', 'start', a]);
    ok(root, ['task', 'done', a]);

    const open = pc(root, ['campaign', 'close', cid]);
    assert.equal(open.code, 1);
    assert.match(open.err, /findings its tasks raised, still open \(1\)/);
    assert.ok(open.err.includes(fid));

    // A claimed finding is still open work — claiming is routing, not resolving.
    const fixer = scopedTask(root, 'fixer', ['b/**'], ['--campaign', cid]);
    ok(root, ['finding', 'claim', fid, '--by', fixer]);
    ok(root, ['task', 'start', fixer]);
    ok(root, ['task', 'done', fixer]);
    const claimed = pc(root, ['campaign', 'close', cid]);
    assert.equal(claimed.code, 1);
    assert.match(claimed.err, /still open \(1\)/);

    ok(root, ['finding', 'fix', fid]);
    const clean = ok(root, ['campaign', 'close', cid]);
    assert.match(clean.out, /closed/);
    const text = readFileSync(campaignFile(root, cid), 'utf8');
    assert.match(text, /status: closed/);
    assert.match(text, /ended: \d{4}-\d{2}-\d{2}T/);
    assert.match(text, /all finished, no open findings/);
    assert.match(ok(root, ['campaign', 'close', cid]).out, /already closed/);
  });

  it('--force closes over open work and records why; a closed campaign takes no new tasks', () => {
    const root = makeRepo();
    const cid = newCampaign(root, 'Cut short');
    const b = scopedTask(root, 'abandoned piece', ['b/**'], ['--campaign', cid]);
    ok(root, ['task', 'start', b]);

    const noReason = pc(root, ['campaign', 'close', cid, '--force']);
    assert.equal(noReason.code, 2, 'a forced close with no reason is a lie in the ledger');
    assert.match(noReason.err, /--reason/);

    const forced = ok(root, ['campaign', 'close', cid, '--force', '--reason', 'the Founder killed the fan-out']);
    assert.match(forced.out, /closed over open work \(--force\)/);
    const text = readFileSync(campaignFile(root, cid), 'utf8');
    assert.match(text, /status: closed/);
    assert.match(text, /the Founder killed the fan-out/);
    assert.match(text, /1 task\(s\) unfinished/);

    const late = pc(root, ['task', 'new', 'late arrival', '--class', 'x', '--role', 'engineer', '--campaign', cid]);
    assert.equal(late.code, 1);
    assert.match(late.err, /is closed/);
  });

  it('status groups by campaign and puts unattached tasks last', () => {
    const root = makeRepo();
    const first = newCampaign(root, 'Alpha campaign');
    const second = newCampaign(root, 'Beta campaign');
    const loose = scopedTask(root, 'unattached chore', ['docs/**']);
    const b1 = scopedTask(root, 'beta one', ['b/one/**'], ['--campaign', second]);
    const a1 = scopedTask(root, 'alpha one', ['a/one/**'], ['--campaign', first]);
    const a2 = scopedTask(root, 'alpha two', ['a/two/**'], ['--campaign', first]);

    const text = ok(root, ['status']).out;
    assert.match(text, /CAMPAIGNS \(2 running\)/);
    assert.ok(text.indexOf('CAMPAIGNS') < text.indexOf('BLOCKED'), 'the campaigns lead the view');
    assert.match(text, new RegExp(`${first} +running +2 queued`));
    assert.match(text, /\(unattached\)/);

    const queued = text.slice(text.indexOf('QUEUED'));
    const at = (id) => queued.indexOf(id);
    assert.ok(at(a1) < at(a2), 'a campaign is contiguous, in id order');
    assert.ok(at(a2) < at(b1), 'campaigns come in ledger order');
    assert.ok(at(b1) < at(loose), 'unattached tasks come last');
    assert.ok(queued.includes(`[${first}]`), 'each queued task carries its campaign');

    const data = JSON.parse(ok(root, ['status', '--json']).out);
    assert.equal(data.campaigns.length, 2);
    assert.equal(data.counts.campaigns_running, 2);
    assert.equal(data.unattached_tasks, 1);
    assert.equal(data.queued[0].campaign, first);
    assert.equal(data.queued.at(-1).campaign, null);
  });

  it('handoff --campaign carries that campaign and nothing else', () => {
    const root = makeRepo(true);
    writeFileSync(join(root, '.paperclip', 'contracts', 'plan-flow.md'), '# Plan flow\n\nOne seam, named once.\n');
    const mine = newCampaign(root, 'Mine', ['--contract', '.paperclip/contracts/plan-flow.md']);
    const other = newCampaign(root, 'Someone else');
    const a = scopedTask(root, 'my running task', ['a/**'], ['--campaign', mine]);
    const b = scopedTask(root, 'their running task', ['b/**'], ['--campaign', other]);
    const loose = scopedTask(root, 'unattached task', ['c/**']);
    ok(root, ['task', 'start', a, '--owner', 'agent:a1', '--note', 'got as far as the port']);
    ok(root, ['task', 'start', b]);
    const fid = idFrom(
      ok(root, ['finding', 'new', '--from', a, '--area', 'z/**', '--severity', 'defect', '--title', 'Mine is off']).out,
      'f',
    );
    const theirFid = idFrom(
      ok(root, ['finding', 'new', '--from', b, '--area', 'z/**', '--severity', 'defect', '--title', 'Theirs is off']).out,
      'f',
    );

    const r = ok(root, ['handoff', '--campaign', mine]);
    assert.match(r.out, new RegExp(`handoff-${mine}\\.md`), 'a scoped brief gets its own default file');
    const brief = readFileSync(join(root, '.paperclip', `handoff-${mine}.md`), 'utf8');
    assert.ok(brief.includes(`Scoped to campaign **${mine}**`));
    assert.ok(brief.includes(a), 'its own task must be in the brief');
    assert.ok(brief.includes(fid), 'a finding its task raised must be in the brief');
    assert.ok(brief.includes('One seam, named once.'), 'its contract is quoted in full');
    assert.ok(!brief.includes(b), `another campaign's task must not leak in`);
    assert.ok(!brief.includes(theirFid), `another campaign's finding must not leak in`);
    assert.ok(!brief.includes(loose), 'an unattached task must not leak in');
    assert.ok(brief.includes('25m 00s'), 'estimates stay whole-log — that is what makes them estimates');

    assert.ok(!existsSync(join(root, '.paperclip', 'handoff.md')), 'a scoped brief must not clobber the whole one');
    ok(root, ['handoff']);
    const all = readFileSync(join(root, '.paperclip', 'handoff.md'), 'utf8');
    assert.ok(all.includes(a) && all.includes(b) && all.includes(loose), 'the unscoped brief still carries everything');
    assert.ok(all.includes(`\`${mine}\``) && all.includes(`\`${other}\``), 'and lists the campaigns');
  });
});

describe('status', () => {
  it('puts blocked before running, running before queued, and groups open findings by area', () => {
    const root = makeRepo(true);
    const blockedId = newTask(root, 'blocked work');
    const runningId = newTask(root, 'running work');
    newTask(root, 'queued work');
    const doneId = newTask(root, 'finished work');

    const raiser = blockedId;
    const fid = idFrom(
      ok(root, ['finding', 'new', '--from', raiser, '--area', 'skeleton/modules/auth-better-auth', '--severity', 'blocker', '--title', 'Session seam is wrong']).out,
      'f',
    );
    ok(root, ['task', 'start', blockedId]);
    ok(root, ['task', 'block', blockedId, '--on', fid]);
    ok(root, ['task', 'start', runningId, '--owner', 'agent:r1']);
    ok(root, ['task', 'start', doneId]);
    ok(root, ['task', 'done', doneId]);

    const text = ok(root, ['status']).out;
    const iBlocked = text.indexOf('BLOCKED');
    const iRunning = text.indexOf('RUNNING');
    const iQueued = text.indexOf('QUEUED');
    const iFinished = text.indexOf('LAST FINISHED');
    const iFindings = text.indexOf('OPEN FINDINGS');
    assert.ok(iBlocked > -1 && iRunning > iBlocked, 'blocked must come before running');
    assert.ok(iQueued > iRunning, 'running must come before queued');
    assert.ok(iFinished > iQueued, 'finished comes after queued');
    assert.ok(iFindings > iFinished, 'open findings come last');

    assert.ok(text.indexOf(blockedId) < iRunning, 'the blocked task is listed in the blocked section');
    assert.match(text, new RegExp(`${blockedId}\\s+← ${fid}`), 'blocked shows what it waits on');
    assert.match(text, /est ~25m 00s \(n=10\)/, 'running shows the estimate for its class');
    assert.match(text, /skeleton\/modules\/auth-better-auth/, 'findings are grouped by owner area');
    assert.match(text, /Session seam is wrong/);
    assert.ok(text.split('\n').length < 40, 'status must stay readable in one screen');
  });

  it('--json is pure JSON with the same ordering information', () => {
    const root = makeRepo(true);
    const a = newTask(root, 'alpha');
    const b = newTask(root, 'beta');
    ok(root, ['task', 'start', a]);
    ok(root, ['task', 'block', a, '--on', 'founder']);
    ok(root, ['task', 'start', b]);

    const r = ok(root, ['status', '--json']);
    const data = JSON.parse(r.out);
    assert.equal(data.counts.blocked, 1);
    assert.equal(data.counts.running, 1);
    assert.equal(data.blocked[0].id, a);
    assert.equal(data.blocked[0].blocked_on, 'founder');
    assert.equal(data.running[0].id, b);
    assert.equal(data.running[0].estimate.median_s, 1500);
    assert.equal(typeof data.running[0].elapsed_s, 'number');
    assert.equal(Object.keys(data)[0], 'generated');
  });

  it('an empty ledger still reports cleanly', () => {
    const root = makeRepo();
    const r = ok(root, ['status']);
    assert.match(r.out, /BLOCKED \(0\)/);
    assert.match(r.out, /\(none\)/);
    assert.deepEqual(JSON.parse(ok(root, ['status', '--json']).out).blocked, []);
  });
});

describe('estimate', () => {
  it('reports median, range and sample count for a class with many samples', () => {
    const root = makeRepo(true);
    const text = ok(root, ['estimate', 'module-build']).out;
    assert.match(text, /module-build/);
    assert.match(text, /25m 00s/); // median of the ten seeded module builds = 1500 s
    assert.match(text, /9m 20s – 55m 50s/); // 560 s – 3350 s
    assert.match(text, /n=10/);

    const data = JSON.parse(ok(root, ['estimate', 'module-build', '--json']).out);
    assert.equal(data.classes[0].n, 10);
    assert.equal(data.classes[0].median_s, 1500);
    assert.equal(data.classes[0].min_s, 560);
    assert.equal(data.classes[0].max_s, 3350);
    assert.equal(data.classes[0].confident, true);
  });

  it('says plainly when a class has fewer than three samples', () => {
    const root = makeRepo(true);
    const text = ok(root, ['estimate']).out;
    assert.match(text, /engine-fix/);
    assert.match(text, /too few to trust/);
    assert.match(text, /Fewer than three samples: engine-fix, matrix/);
    const data = JSON.parse(ok(root, ['estimate', '--json']).out);
    assert.equal(data.classes.find((c) => c.class === 'engine-fix').confident, false);
    assert.equal(data.classes.find((c) => c.class === 'inventory').confident, true);
  });

  it('handles a class with no samples at all', () => {
    const root = makeRepo(true);
    const r = ok(root, ['estimate', 'never-run-before']);
    assert.match(r.out, /no samples for class "never-run-before"/);
    const data = JSON.parse(ok(root, ['estimate', 'never-run-before', '--json']).out);
    assert.deepEqual(data.classes, []);
    assert.equal(data.samples, 0);
  });

  it('says plainly that nothing in the log carries a token count', () => {
    const root = makeRepo(true); // the seed rows all have "tokens": null
    const text = ok(root, ['estimate']).out;
    assert.match(text, /No token counts in this log/);
    assert.doesNotMatch(text, /^class .*tokens/m, 'no token column when there is nothing to put in it');
    const data = JSON.parse(ok(root, ['estimate', '--json']).out);
    for (const c of data.classes) {
      assert.equal(c.tokens_n, 0);
      assert.equal(c.median_tokens, null);
    }
  });

  it('reports a median token count per class where the rows carry one', () => {
    const root = makeRepo();
    writeFileSync(
      join(root, '.paperclip', 'log', 'tasks.jsonl'),
      [
        { id: 'w-1', class: 'gate-run', model: 'cheap', duration_s: 60, tokens: 8000 },
        { id: 'w-2', class: 'gate-run', model: 'cheap', duration_s: 90, tokens: 12000 },
        { id: 'w-3', class: 'gate-run', model: 'cheap', duration_s: 120, tokens: 16000 },
        { id: 'w-4', class: 'judgment', model: 'expensive', duration_s: 1200, tokens: 220000 },
        { id: 'w-5', class: 'judgment', model: 'expensive', duration_s: 1800, tokens: 260000 },
        { id: 'w-6', class: 'judgment', model: 'expensive', duration_s: 2400, tokens: 300000 },
        { id: 'w-7', class: 'no-counts', duration_s: 30, tokens: null },
      ]
        .map((r) => JSON.stringify(r))
        .join('\n'),
    );

    const text = ok(root, ['estimate']).out;
    assert.match(text, /tokens/, 'the token column appears once any row carries one');
    assert.match(text, /12k \(n=3\)/, 'median tokens for the cheap class');
    assert.match(text, /260k \(n=3\)/, 'median tokens for the expensive class');
    assert.match(text, /Models: gate-run — cheap \(3\)/);
    assert.match(text, /judgment — expensive \(3\)/);
    assert.doesNotMatch(text, /No token counts in this log/);

    const data = JSON.parse(ok(root, ['estimate', '--json']).out);
    const byClass = Object.fromEntries(data.classes.map((c) => [c.class, c]));
    assert.equal(byClass['gate-run'].median_tokens, 12000);
    assert.equal(byClass['gate-run'].tokens_n, 3);
    assert.deepEqual(byClass['gate-run'].models, [{ model: 'cheap', n: 3 }]);
    assert.equal(byClass.judgment.median_tokens, 260000);
    assert.equal(byClass['no-counts'].tokens_n, 0, 'a class with no counts is honest about it');
    assert.deepEqual(byClass['no-counts'].models, []);
  });

  it('--model rides on the task and into the log row beside tokens and tool uses', () => {
    const root = makeRepo();
    const cid = newCampaign(root, 'Measured');
    const id = scopedTask(root, 'mechanical sweep', ['a/**'], ['--campaign', cid, '--model', 'cheap-model']);
    assert.match(readFileSync(taskFile(root, id), 'utf8'), /model: cheap-model/);

    ok(root, ['task', 'start', id]);
    ok(root, ['task', 'done', id, '--tokens', '4200', '--tool-uses', '17']);
    const row = JSON.parse(readFileSync(join(root, '.paperclip', 'log', 'tasks.jsonl'), 'utf8').trim());
    assert.equal(row.model, 'cheap-model');
    assert.equal(row.campaign, cid);
    assert.equal(row.tokens, 4200);
    assert.equal(row.tool_uses, 17);

    // Unpassed stays null rather than guessed, and --model at close records what it really ran on.
    const second = scopedTask(root, 'unmeasured', ['b/**']);
    ok(root, ['task', 'start', second]);
    ok(root, ['task', 'done', second, '--model', 'decided-late']);
    const rows = readFileSync(join(root, '.paperclip', 'log', 'tasks.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    assert.equal(rows[1].tokens, null);
    assert.equal(rows[1].model, 'decided-late');
    assert.equal(rows[1].campaign, null);
    assert.match(readFileSync(taskFile(root, second), 'utf8'), /model: decided-late/);
  });

  it('reports nothing rather than crashing on an empty or corrupt log', () => {
    const root = makeRepo();
    assert.match(ok(root, ['estimate']).out, /no estimates/);
    writeFileSync(join(root, '.paperclip', 'log', 'tasks.jsonl'), '{"id":"w-1","class":"x","duration_s":10}\nnot json at all\n{"broken":\n');
    const r = ok(root, ['estimate']);
    assert.match(r.out, /^Estimates from/m);
    assert.match(r.out, /n=1/);
  });
});

describe('handoff', () => {
  it('is self-contained: every open task, every open finding, the contracts and the estimates', () => {
    const root = makeRepo(true);
    writeFileSync(
      join(root, '.paperclip', 'contracts', 'module-port.md'),
      '# Module port\n\nEvery module exports `register(app, deps)` and nothing else.\n',
    );
    writeFileSync(join(root, '.paperclip', 'STATUS.md'), '# Control panel\n');

    const blockedId = newTask(root, 'stripe module', ['--scope', 'skeleton/modules/payments-stripe/**', '--gates', 'typecheck,test']);
    const runningId = newTask(root, 'auth module', ['--scope', 'skeleton/modules/auth-better-auth/**']);
    const queuedId = newTask(root, 'telemetry module');
    const doneId = newTask(root, 'copy kit module');

    const fid = idFrom(
      ok(root, ['finding', 'new', '--from', blockedId, '--area', 'skeleton/modules/auth-better-auth', '--severity', 'blocker', '--title', 'Session seam drops fields'], {
        input: '## What\nnarrowSession() drops fields.\n\n## Evidence\n`yarn typecheck` says TS2339.\n\n## Suggested fix\nWiden the return type.\n',
      }).out,
      'f',
    );
    ok(root, ['task', 'start', blockedId, '--owner', 'agent:s1', '--note', 'got as far as the webhook port']);
    ok(root, ['task', 'block', blockedId, '--on', fid]);
    ok(root, ['task', 'start', runningId, '--owner', 'agent:a1']);
    ok(root, ['task', 'start', doneId]);
    ok(root, ['task', 'done', doneId]);

    const outFile = join(root, 'handoff.md');
    const r = ok(root, ['handoff', '--out', outFile]);
    assert.match(r.out, /handoff written/);
    const brief = readFileSync(outFile, 'utf8');

    for (const id of [blockedId, runningId, queuedId]) {
      assert.ok(brief.includes(id), `handoff is missing unfinished task ${id}`);
    }
    assert.ok(brief.includes(fid), 'handoff is missing the open finding');
    assert.ok(brief.includes('narrowSession() drops fields.'), 'finding body must be quoted in full');
    assert.ok(brief.includes('Every module exports'), 'contracts must be quoted in full');
    assert.ok(brief.includes('skeleton/modules/payments-stripe/**'), 'scope must travel with the task');
    assert.ok(brief.includes('got as far as the webhook port'), 'notes must travel with the task');
    assert.ok(brief.includes('.paperclip/STATUS.md'), 'cold-start pointers must be listed');
    assert.ok(brief.includes('PLAYBOOK'), 'cold-start pointers must name the playbook');
    assert.ok(brief.includes('25m 00s'), 'estimates must be included');
    assert.ok(brief.includes(doneId), 'finished work belongs in the context section');
    assert.ok(brief.length > 2000, 'a handoff this thin cannot be standalone');

    // No unresolved placeholders outside the command-usage code fences.
    const prose = brief.replace(/```[\s\S]*?```/g, '');
    for (const marker of ['{{', '__PC_ID__', 'undefined', '[object Object]', 'TODO', 'TBD', 'FIXME', 'NaN', 'XXX']) {
      assert.ok(!prose.includes(marker), `handoff contains an unresolved placeholder: ${marker}`);
    }
    assert.ok(!/<[a-z][a-z0-9_-]*>/i.test(prose), `handoff has an angle-bracket placeholder: ${prose.match(/<[a-z][a-z0-9_-]*>/i)}`);
  });

  it('defaults to .paperclip/handoff.md and reports what it wrote as JSON', () => {
    const root = makeRepo();
    newTask(root, 'still queued');
    const data = JSON.parse(ok(root, ['handoff', '--json']).out);
    assert.equal(data.path, '.paperclip/handoff.md');
    assert.equal(data.open_tasks, 1);
    assert.ok(existsSync(join(root, '.paperclip', 'handoff.md')));
  });

  it('is honest about an empty campaign instead of emitting blanks', () => {
    const root = makeRepo();
    ok(root, ['handoff', '--out', join(root, 'h.md')]);
    const brief = readFileSync(join(root, 'h.md'), 'utf8');
    assert.match(brief, /None\./);
    assert.match(brief, /None open\./);
    assert.match(brief, /nothing to estimate from/);
  });
});

describe('--json', () => {
  it('parses for every command that offers it, with no prose mixed in', () => {
    const root = makeRepo(true);
    const id = newTask(root, 'json shaped');
    ok(root, ['task', 'start', id]);
    ok(root, ['finding', 'new', '--from', id, '--area', 'a/b', '--severity', 'defect', '--title', 'Something is off']);

    const cases = [
      ['task', 'list', '--json'],
      ['task', 'show', id, '--json'],
      ['finding', 'list', '--json'],
      ['status', '--json'],
      ['estimate', '--json'],
      ['handoff', '--json'],
      ['notify', 'blocked', 'a message', '--json'],
    ];
    for (const args of cases) {
      const r = ok(root, args, { env: { PAPERCLIP_NOTIFY_CMD: 'true' } });
      assert.doesNotThrow(() => JSON.parse(r.out), `not pure JSON: pc ${args.join(' ')}\n${r.out}`);
    }

    const shown = JSON.parse(ok(root, ['task', 'show', id, '--json']).out);
    assert.equal(shown.id, id);
    assert.equal(shown.status, 'running');
    assert.ok(Array.isArray(shown.notes));
    assert.ok(Array.isArray(shown.scope));

    const listed = JSON.parse(ok(root, ['task', 'list', '--status', 'running', '--json']).out);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, id);
    assert.equal(JSON.parse(ok(root, ['task', 'list', '--class', 'nope', '--json']).out).length, 0);
  });
});

describe('concurrency', () => {
  const run = (cwd, args) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [PC_MJS, ...args], { cwd, stdio: 'ignore' });
      child.on('exit', (code) => resolve(code));
    });

  it('ten simultaneous log appends lose no lines', async () => {
    const root = makeRepo();
    const ids = [];
    for (let i = 0; i < 10; i++) {
      const id = newTask(root, `parallel agent ${i}`);
      ids.push(id);
      ok(root, ['task', 'start', id]);
    }
    const codes = await Promise.all(ids.map((id) => run(root, ['task', 'done', id])));
    assert.deepEqual(codes, new Array(10).fill(0));

    const raw = readFileSync(join(root, '.paperclip', 'log', 'tasks.jsonl'), 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim() !== '');
    assert.equal(lines.length, 10, `expected 10 log lines, got ${lines.length}`);
    const parsed = lines.map((l) => JSON.parse(l)); // every line must be complete JSON
    assert.deepEqual(new Set(parsed.map((p) => p.id)), new Set(ids));
  });

  it('ten simultaneous notes on one task lose no lines', async () => {
    const root = makeRepo();
    const id = newTask(root, 'contended');
    const codes = await Promise.all(
      Array.from({ length: 10 }, (_, i) => run(root, ['task', 'note', id, `concurrent note ${i}`])),
    );
    assert.deepEqual(codes, new Array(10).fill(0));
    const text = readFileSync(taskFile(root, id), 'utf8');
    for (let i = 0; i < 10; i++) {
      assert.ok(text.includes(`concurrent note ${i}`), `lost concurrent note ${i}`);
    }
    assert.match(text, /^id: /m, 'the frontmatter must be intact');
    assert.equal((text.match(/^## Notes$/gm) || []).length, 1, 'exactly one Notes section');
  });

  it('ten simultaneous task creations all get distinct ids', async () => {
    const root = makeRepo();
    const codes = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        run(root, ['task', 'new', `racer ${i}`, '--class', 'module-build', '--role', 'engineer']),
      ),
    );
    assert.deepEqual(codes, new Array(10).fill(0));
    const files = readdirSync(join(root, '.paperclip', 'work')).filter((f) => f.endsWith('.md'));
    assert.equal(files.length, 10, `expected 10 task files, got ${files.length}: ${files}`);
    assert.equal(new Set(files).size, 10);
  });
});

describe('ledger discovery', () => {
  it('finds .paperclip by walking up from a deeply nested subdirectory', () => {
    const root = makeRepo();
    const nested = join(root, 'packages', 'apps', 'web', 'src', 'features');
    mkdirSync(nested, { recursive: true });
    const id = idFrom(
      ok(nested, ['task', 'new', 'from the depths', '--class', 'module-build', '--role', 'engineer']).out,
      'w',
    );
    assert.ok(existsSync(taskFile(root, id)), 'the task must land in the root ledger, not the nested dir');
    assert.ok(!existsSync(join(nested, '.paperclip')), 'no stray ledger under the nested dir');
    assert.match(ok(nested, ['status']).out, new RegExp(id));
  });

  it('fails with a clear message outside any ledger', () => {
    const outside = mkdtempSync(join(TEST_ROOT, 'pc-nowhere-'));
    created.push(outside);
    const r = pc(outside, ['status']);
    assert.equal(r.code, 1);
    assert.match(r.err, /no \.paperclip\/ found/);
  });

  it('PAPERCLIP_DIR overrides the walk', () => {
    const root = makeRepo();
    const elsewhere = mkdtempSync(join(TEST_ROOT, 'pc-elsewhere-'));
    created.push(elsewhere);
    ok(elsewhere, ['task', 'new', 'remote control', '--class', 'doc-pass', '--role', 'engineer'], {
      env: { PAPERCLIP_DIR: join(root, '.paperclip') },
    });
    assert.equal(readdirSync(join(root, '.paperclip', 'work')).filter((f) => f.endsWith('.md')).length, 1);
  });

  it('the bash shim runs the implementation', () => {
    const root = makeRepo();
    const r = spawnSync(PC_SH, ['task', 'list'], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /no tasks match/);
  });
});

describe('notify', () => {
  it('runs $PAPERCLIP_NOTIFY_CMD with the event and message', () => {
    const root = makeRepo();
    const sink = join(root, 'notified.txt');
    const r = ok(root, ['notify', 'blocked', 'w-0042 is waiting on the Founder'], {
      env: { PAPERCLIP_NOTIFY_CMD: `printf '%s|%s' "$PAPERCLIP_EVENT" "$PAPERCLIP_MESSAGE" > ${JSON.stringify(sink)}` },
    });
    assert.match(r.out, /w-0042 is waiting on the Founder/);
    assert.equal(readFileSync(sink, 'utf8'), 'blocked|w-0042 is waiting on the Founder');

    const events = readFileSync(join(root, '.paperclip', 'log', 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const last = events.at(-1);
    assert.equal(last.event, 'notify.blocked');
    assert.equal(last.delivered, true);
    assert.equal(last.channel, 'PAPERCLIP_NOTIFY_CMD');
  });

  it('also passes the event and message as positional arguments', () => {
    const root = makeRepo();
    const sink = join(root, 'args.txt');
    ok(root, ['notify', 'campaign-done', 'all eight agents finished'], {
      env: { PAPERCLIP_NOTIFY_CMD: `printf '%s/%s' "$1" "$2" > ${JSON.stringify(sink)}` },
    });
    assert.equal(readFileSync(sink, 'utf8'), 'campaign-done/all eight agents finished');
  });

  it('still exits 0 when the notify command fails, and logs the failure', () => {
    const root = makeRepo();
    const r = pc(root, ['notify', 'agent-failed', 'w-0007 died'], {
      env: { PAPERCLIP_NOTIFY_CMD: 'exit 3' },
    });
    assert.equal(r.code, 0, 'notify must never fail its caller');
    assert.match(r.out, /delivery failed/);
    const last = JSON.parse(readFileSync(join(root, '.paperclip', 'log', 'events.jsonl'), 'utf8').trim().split('\n').at(-1));
    assert.equal(last.event, 'notify.agent-failed');
    assert.equal(last.delivered, false);
    assert.equal(last.message, 'w-0007 died');
  });

  it('still exits 0 when the notify command does not exist', () => {
    const root = makeRepo();
    const r = pc(root, ['notify', 'blocked', 'nobody home'], {
      env: { PAPERCLIP_NOTIFY_CMD: 'definitely-not-a-real-binary-9d3f' },
    });
    assert.equal(r.code, 0);
    assert.ok(existsSync(join(root, '.paperclip', 'log', 'events.jsonl')));
  });

  it('rejects an unknown event', () => {
    const root = makeRepo();
    const r = pc(root, ['notify', 'lunchtime', 'hello'], { env: { PAPERCLIP_NOTIFY_CMD: 'true' } });
    assert.equal(r.code, 2);
    assert.match(r.err, /blocked \| campaign-done \| agent-failed/);
  });
});

describe('usage', () => {
  it('an unknown command prints usage and exits 2', () => {
    const root = makeRepo();
    const r = pc(root, ['frobnicate']);
    assert.equal(r.code, 2);
    assert.match(r.err, /unknown command "frobnicate"/);
    assert.match(r.err, /pc status/);
  });

  it('an unknown verb prints usage and exits 2', () => {
    const root = makeRepo();
    for (const args of [['task', 'obliterate', 'w-0001'], ['finding', 'obliterate', 'f-0001'], ['task'], ['finding']]) {
      const r = pc(root, args);
      assert.equal(r.code, 2, `pc ${args.join(' ')} should exit 2`);
      assert.match(r.err, /unknown (task|finding) verb/);
    }
  });

  it('bare pc prints usage on stdout and exits 2; --help exits 0', () => {
    const root = makeRepo();
    const bare = pc(root, []);
    assert.equal(bare.code, 2);
    assert.match(bare.out, /pc — the Paperclip coordination ledger/);
    const help = pc(root, ['--help']);
    assert.equal(help.code, 0);
    assert.match(help.out, /pc handoff/);
  });

  it('a missing flag value is a usage error, not a crash', () => {
    const root = makeRepo();
    const r = pc(root, ['task', 'new', 'no class', '--class']);
    assert.equal(r.code, 2);
    assert.match(r.err, /--class needs a value/);
  });

  it('an unknown id is a clear error', () => {
    const root = makeRepo();
    const r = pc(root, ['task', 'show', 'w-9999-nope']);
    assert.equal(r.code, 1);
    assert.match(r.err, /no task matching/);
  });

  it('a bare sequence number resolves to the one matching record', () => {
    const root = makeRepo();
    const id = newTask(root, 'shorthand');
    assert.match(ok(root, ['task', 'show', 'w-0001']).out, new RegExp(id));
    assert.match(ok(root, ['task', 'show', '1']).out, new RegExp(id));
  });
});
