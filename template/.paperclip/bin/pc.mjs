#!/usr/bin/env node
// pc — the Paperclip coordination ledger.
//
// Durable, plain-text state for a campaign of parallel agents: campaigns, tasks, findings,
// an append-only log, estimates, and a self-contained handoff brief. Zero dependencies.
// Everything it knows lives in .paperclip/ as files a human can read and hand-edit.
//
//   .paperclip/campaigns/<id>.md   one fan-out         (c-<seq4>-<slug>)
//   .paperclip/work/<id>.md        one task            (w-<seq4>-<slug>)
//   .paperclip/findings/<id>.md    one cross-agent defect (f-<seq4>-<slug>)
//   .paperclip/log/tasks.jsonl     one line per finished task (done|failed)
//   .paperclip/log/events.jsonl    one line per mutation and notification
//   .paperclip/contracts/*.md      the seams agents build against
//   .paperclip/research/*.md       durable findings-from-reading, not defects
//
// Run `pc` with no arguments for the command surface.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TASK_STATUSES = ['queued', 'running', 'blocked', 'done', 'failed'];
const FINDING_STATUSES = ['open', 'claimed', 'fixed', 'wontfix'];
const CAMPAIGN_STATUSES = ['running', 'closed'];
const SEVERITIES = ['blocker', 'defect', 'nit'];
const NOTIFY_EVENTS = ['blocked', 'campaign-done', 'agent-failed'];
const TERMINAL = ['done', 'failed'];
// A task in one of these states still owns its scope — nobody else may claim those paths.
const LIVE = ['queued', 'running', 'blocked'];

// Frontmatter key order. Unknown keys survive a round-trip and are emitted after these.
const TASK_KEYS = [
  'id',
  'title',
  'campaign',
  'class',
  'role',
  'model',
  'status',
  'owner',
  'started',
  'ended',
  'scope',
  'contract',
  'gates',
  'blocked_on',
];
const FINDING_KEYS = ['id', 'raised_by', 'owner_area', 'owner_task', 'severity', 'status'];
const CAMPAIGN_KEYS = ['id', 'title', 'status', 'contract', 'started', 'ended'];
// Keys rendered as a block list (`key:` then `  - item`). Everything else inline.
const BLOCK_LIST_KEYS = new Set(['scope']);

class PcError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger location — walk up from $PWD so pc works anywhere in the tree
// ─────────────────────────────────────────────────────────────────────────────

/** Find the `.paperclip` directory by walking up from `start`. PAPERCLIP_DIR overrides. */
export function findLedger(start = process.cwd(), env = process.env) {
  if (env.PAPERCLIP_DIR) {
    const dir = resolve(env.PAPERCLIP_DIR);
    if (!isDir(dir)) throw new PcError(`PAPERCLIP_DIR is not a directory: ${dir}`, 1);
    return dir;
  }
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, '.paperclip');
    if (isDir(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new PcError(
    `no .paperclip/ found in ${resolve(start)} or any parent — run pc from inside a Paperclip repo`,
    1,
  );
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function ledgerPaths(pcDir) {
  return {
    pc: pcDir,
    root: dirname(pcDir),
    campaigns: join(pcDir, 'campaigns'),
    work: join(pcDir, 'work'),
    findings: join(pcDir, 'findings'),
    log: join(pcDir, 'log'),
    research: join(pcDir, 'research'),
    contracts: join(pcDir, 'contracts'),
    tasksLog: join(pcDir, 'log', 'tasks.jsonl'),
    eventsLog: join(pcDir, 'log', 'events.jsonl'),
  };
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// Frontmatter — dependency-free, forgiving of hand edits
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse `---`-fenced frontmatter. Supports `key: value`, `key: [a, b]`, and a
 * `key:` followed by indented `- item` lines. Anything it cannot read is ignored
 * rather than fatal — a human edits these files.
 */
export function parseFrontmatter(text) {
  const src = text.replace(/^﻿/, '');
  const lines = src.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (lines[i]?.trim() !== '---') return { data: {}, body: src, order: [] };
  const open = i;
  let close = -1;
  for (let j = open + 1; j < lines.length; j++) {
    if (lines[j].trim() === '---') {
      close = j;
      break;
    }
  }
  if (close === -1) return { data: {}, body: src, order: [] }; // unterminated: treat as body

  const data = {};
  const order = [];
  let listKey = null;
  for (let j = open + 1; j < close; j++) {
    const raw = lines[j];
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;

    const item = raw.match(/^\s*-\s+(.*)$/);
    if (item && listKey) {
      const v = unquote(stripComment(item[1]).trim());
      if (v !== '') data[listKey].push(v);
      continue;
    }

    const kv = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*:\s*(.*)$/);
    if (!kv) continue; // unreadable line — skip, don't die
    const key = kv[1];
    const rest = stripComment(kv[2]).trim();
    if (!order.includes(key)) order.push(key);
    if (rest === '') {
      data[key] = [];
      listKey = key;
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      data[key] = rest
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s.trim()))
        .filter((s) => s !== '');
      listKey = null;
    } else {
      data[key] = unquote(rest);
      listKey = null;
    }
  }
  // `key:` with no list items under it reads back as an empty string, not [].
  for (const k of Object.keys(data)) {
    if (Array.isArray(data[k]) && data[k].length === 0 && !BLOCK_LIST_KEYS.has(k)) data[k] = '';
  }
  const body = lines.slice(close + 1).join('\n').replace(/^\n/, '');
  return { data, body, order };
}

function stripComment(s) {
  // `value   # trailing note` — only when the # is preceded by whitespace.
  const m = s.match(/^(.*?)(?:\s+#\s.*)?$/s);
  return m ? m[1] : s;
}

function unquote(s) {
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

/** Render frontmatter + body back to a file. Absent keys are omitted entirely. */
export function stringifyDoc(data, body, keyOrder) {
  const seen = new Set();
  const out = ['---'];
  const emit = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    const v = data[key];
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) {
      if (v.length === 0) return;
      if (BLOCK_LIST_KEYS.has(key)) {
        out.push(`${key}:`);
        for (const item of v) out.push(`  - ${item}`);
      } else {
        out.push(`${key}: [${v.join(', ')}]`);
      }
    } else {
      out.push(`${key}: ${v}`);
    }
  };
  for (const k of keyOrder) emit(k);
  for (const k of Object.keys(data)) emit(k);
  out.push('---', '');
  return `${out.join('\n')}${body.startsWith('\n') ? body.slice(1) : body}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Atomic-ish file writes
// ─────────────────────────────────────────────────────────────────────────────

/** Whole-file replace via temp + rename, so a reader never sees a torn file. */
function writeAtomic(file, contents) {
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  writeFileSync(tmp, contents, 'utf8');
  renameSync(tmp, file);
}

/** One complete line, one appendFileSync — the concurrency contract for JSONL. */
function appendLine(file, obj) {
  ensureDir(dirname(file));
  appendFileSync(file, `${JSON.stringify(obj)}\n`, 'utf8');
}

function readJsonl(file) {
  if (!existsSync(file)) return [];
  const rows = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (t === '' || t.startsWith('#') || t.startsWith('//')) continue;
    try {
      rows.push(JSON.parse(t));
    } catch {
      /* forgiving: a half-written or hand-mangled line never breaks a read */
    }
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ids
// ─────────────────────────────────────────────────────────────────────────────

export function slugify(title, maxWords = 6) {
  const words = String(title)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords);
  const slug = words.join('-').slice(0, 48).replace(/-+$/, '');
  return slug || 'untitled';
}

function seqOf(name, prefix) {
  const m = name.match(new RegExp(`^${prefix}-(\\d{4})-`));
  return m ? Number(m[1]) : null;
}

function usedSeqs(dir, prefix) {
  if (!isDir(dir)) return new Set();
  const seqs = new Set();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const n = seqOf(f, prefix);
    if (n !== null) seqs.add(n);
  }
  return seqs;
}

/**
 * Allocate the next free sequence number and create the file with O_EXCL.
 * No locking: on a collision (another agent took the number between our scan and
 * our write) we simply retry with the next one. `hooks.beforeCreate` exists so the
 * test suite can force that race.
 */
export function createRecord(dir, prefix, slug, contents, hooks = {}) {
  ensureDir(dir);
  const maxAttempts = 50;
  let seq = Math.max(0, ...usedSeqs(dir, prefix)) + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const taken = usedSeqs(dir, prefix);
    while (taken.has(seq)) seq++;
    const id = `${prefix}-${String(seq).padStart(4, '0')}-${slug}`;
    const file = join(dir, `${id}.md`);
    if (hooks.beforeCreate) hooks.beforeCreate({ id, file, seq, attempt });
    try {
      writeFileSync(file, contents.replace('__PC_ID__', id), { encoding: 'utf8', flag: 'wx' });
      return { id, file };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      seq++; // collision — retry with the next number
    }
  }
  throw new PcError(`could not allocate a free ${prefix}- id after ${maxAttempts} attempts`, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Records
// ─────────────────────────────────────────────────────────────────────────────

function recordPath(dir, id) {
  const direct = join(dir, `${id}.md`);
  if (existsSync(direct)) return direct;
  // Forgiving lookup: bare sequence (`w-0042`, or even `42`) resolves to the one match.
  const norm = String(id).replace(/\.md$/, '');
  const bare = norm.match(/^(?:([wfc])-)?(\d{1,4})$/);
  if (isDir(dir)) {
    const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
    if (bare) {
      const want = String(Number(bare[2])).padStart(4, '0');
      const hits = files.filter((f) => f.split('-')[1] === want);
      if (hits.length === 1) return join(dir, hits[0]);
    }
    const hits = files.filter((f) => f.startsWith(`${norm}-`) || f === `${norm}.md`);
    if (hits.length === 1) return join(dir, hits[0]);
  }
  return null;
}

function loadRecord(dir, id, kind) {
  const file = recordPath(dir, id);
  if (!file) throw new PcError(`no ${kind} matching "${id}" in ${dir}`, 1);
  const text = readFileSync(file, 'utf8');
  const { data, body, order } = parseFrontmatter(text);
  return { file, data, body, order, text };
}

function saveRecord(rec, keys) {
  writeAtomic(rec.file, stringifyDoc(rec.data, rec.body, keys));
}

function listRecords(dir, kind) {
  if (!isDir(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.md') || f === 'README.md') continue;
    try {
      const text = readFileSync(join(dir, f), 'utf8');
      const { data, body } = parseFrontmatter(text);
      if (!data.id) data.id = f.replace(/\.md$/, '');
      out.push({ file: join(dir, f), data, body, kind });
    } catch {
      /* unreadable file: skip rather than break every listing */
    }
  }
  return out;
}

/**
 * Append a timestamped line to `## Notes`. Append-only: when Notes is the last
 * section (the normal case) this is a single appendFileSync that cannot disturb
 * an existing line. Otherwise the note is spliced in at the end of the section.
 */
export function appendNote(file, text, now = nowIso()) {
  const line = `- ${now} — ${String(text).replace(/\r?\n/g, ' ').trim()}`;
  const cur = readFileSync(file, 'utf8');
  const idx = cur.lastIndexOf('\n## Notes');
  if (idx === -1) {
    const pad = cur.endsWith('\n') ? '' : '\n';
    appendFileSync(file, `${pad}\n## Notes\n${line}\n`, 'utf8');
    return line;
  }
  const after = cur.slice(idx + 1);
  const nextHeading = after.slice(1).search(/\n## /);
  if (nextHeading === -1) {
    const pad = cur.endsWith('\n') ? '' : '\n';
    appendFileSync(file, `${pad}${line}\n`, 'utf8');
    return line;
  }
  const cut = idx + 1 + 1 + nextHeading + 1;
  writeAtomic(file, `${cur.slice(0, cut)}${line}\n${cur.slice(cut)}`);
  return line;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scope — one writer per file, checked mechanically
// ─────────────────────────────────────────────────────────────────────────────

const WILDCARD = /[*?[\]{}]/;

/**
 * The literal head of a glob: the path segments before the first one that contains a
 * wildcard. `a/b/**` → ['a','b'] · `src/*.ts` → ['src'] · `a/b/c.ts` → ['a','b','c.ts'].
 * Everything below the head is unknowable without touching the filesystem, which is
 * exactly why the comparison below stops there.
 */
export function scopePrefix(glob) {
  const norm = String(glob)
    .trim()
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '');
  const segs = norm === '' ? [] : norm.split('/');
  const head = [];
  for (const s of segs) {
    if (WILDCARD.test(s)) break;
    head.push(s.toLowerCase()); // case-insensitive: a/B and a/b are one file on macOS
  }
  return { norm, head, literal: head.length === segs.length };
}

/**
 * Do two scope globs claim any of the same paths? Deliberately conservative: it compares
 * the literal heads segment by segment and calls it an overlap the moment one head runs
 * out, because `a/**` and `a/b/c.ts`, and `a/b` and `a/b/c.ts`, and `**` and anything, all
 * name the same file. Only a divergence between two literal segments proves separation.
 * A false overlap costs a `--force`; a false pass costs a corrupted tree.
 */
export function globsOverlap(a, b) {
  const A = scopePrefix(a);
  const B = scopePrefix(b);
  const n = Math.min(A.head.length, B.head.length);
  for (let i = 0; i < n; i++) {
    if (A.head[i] !== B.head[i]) return false; // two literal segments differ — separate trees
  }
  return true; // one head is a prefix of the other (or equal): assume they meet
}

function scopeOf(data) {
  const s = data.scope;
  return Array.isArray(s) ? s : s ? [s] : [];
}

/** Every live task whose scope meets `globs`, with the overlapping pairs that prove it. */
function scopeConflicts(paths, globs, selfId = null) {
  const conflicts = [];
  for (const t of listRecords(paths.work, 'task')) {
    if (!LIVE.includes(t.data.status)) continue; // a finished task no longer owns its scope
    if (selfId && t.data.id === selfId) continue;
    const pairs = [];
    for (const mine of globs) {
      for (const theirs of scopeOf(t.data)) {
        if (globsOverlap(mine, theirs)) pairs.push([mine, theirs]);
      }
    }
    if (pairs.length) {
      conflicts.push({
        id: t.data.id,
        status: t.data.status,
        title: t.data.title || '',
        overlaps: pairs.map(([mine, theirs]) => ({ glob: mine, claimed_by_them: theirs })),
      });
    }
  }
  return conflicts;
}

function renderConflicts(conflicts) {
  const L = [];
  for (const c of conflicts) {
    L.push(`  ${c.id} (${c.status})  ${c.title}`);
    for (const o of c.overlaps) L.push(`      ${o.glob}  overlaps  ${o.claimed_by_them}`);
  }
  return L.join('\n');
}

function overlapPhrase(overlaps, flip = false) {
  return overlaps
    .map((o) => (flip ? `${o.claimed_by_them} overlaps ${o.glob}` : `${o.glob} overlaps ${o.claimed_by_them}`))
    .join('; ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Body helpers
// ─────────────────────────────────────────────────────────────────────────────

function section(body, heading) {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

function notesOf(body) {
  return section(body, 'Notes')
    .split('\n')
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// Time
// ─────────────────────────────────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function secondsBetween(a, b) {
  const t0 = Date.parse(a);
  const t1 = Date.parse(b);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null;
  return Math.max(0, Math.round((t1 - t0) / 1000));
}

export function fmtDur(s) {
  if (s === null || s === undefined || Number.isNaN(s)) return '—';
  const n = Math.max(0, Math.round(s));
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const rem = n % 60;
  if (m < 60) return `${m}m ${String(rem).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Log + estimates
// ─────────────────────────────────────────────────────────────────────────────

function logEvent(paths, event, extra = {}) {
  try {
    appendLine(paths.eventsLog, { ts: nowIso(), event, ...extra });
  } catch {
    /* the log must never fail a mutation */
  }
}

function logTask(paths, row) {
  appendLine(paths.tasksLog, row);
}

export function median(nums) {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function estimates(rows) {
  const byClass = new Map();
  for (const r of rows) {
    const cls = r.class || 'unclassified';
    const d = Number(r.duration_s);
    if (!Number.isFinite(d) || d <= 0) continue;
    if (!byClass.has(cls)) {
      byClass.set(cls, { class: cls, samples: [], tokens: [], models: new Map(), seed: 0 });
    }
    const e = byClass.get(cls);
    e.samples.push(d);
    const tk = Number(r.tokens);
    if (Number.isFinite(tk) && tk > 0) e.tokens.push(tk); // null unless the harness passed it
    if (r.model) e.models.set(r.model, (e.models.get(r.model) || 0) + 1);
    if (r.seed) e.seed++;
  }
  return [...byClass.values()]
    .map((e) => ({
      class: e.class,
      n: e.samples.length,
      seed: e.seed,
      median_s: median(e.samples),
      min_s: Math.min(...e.samples),
      max_s: Math.max(...e.samples),
      confident: e.samples.length >= 3,
      tokens_n: e.tokens.length,
      median_tokens: median(e.tokens),
      models: [...e.models.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([model, n]) => ({ model, n })),
    }))
    .sort((a, b) => a.class.localeCompare(b.class));
}

/** Token counts are read at a glance or not at all: 940 · 4.8k · 48k · 1.2M. */
export function fmtTokens(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function estimateFor(rows, cls) {
  return estimates(rows).find((e) => e.class === cls) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Arg parsing
// ─────────────────────────────────────────────────────────────────────────────

const BOOL_FLAGS = new Set(['json', 'force', 'help']);
const MULTI_FLAGS = new Set(['scope']);

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      let name = a.slice(2);
      let value = null;
      const eq = name.indexOf('=');
      if (eq !== -1) {
        value = name.slice(eq + 1);
        name = name.slice(0, eq);
      }
      const key = name.replace(/-/g, '_');
      if (BOOL_FLAGS.has(key)) {
        flags[key] = value === null ? true : value !== 'false';
        continue;
      }
      if (value === null) {
        value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) {
          throw new PcError(`--${name} needs a value`, 2);
        }
        i++;
      }
      if (MULTI_FLAGS.has(key)) (flags[key] ||= []).push(value);
      else flags[key] = value;
      continue;
    }
    if (a === '-h') {
      flags.help = true;
      continue;
    }
    positional.push(a);
  }
  return { positional, flags };
}

function need(flags, name, verb) {
  const v = flags[name.replace(/-/g, '_')];
  if (v === undefined || v === null || v === '') throw new PcError(`${verb} needs --${name}`, 2);
  return v;
}

function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new PcError(`${label} must be one of: ${allowed.join(' | ')} (got "${value}")`, 2);
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────────────

function out(s = '') {
  try {
    process.stdout.write(`${s}\n`);
  } catch (err) {
    if (err && err.code === 'EPIPE') process.exit(0); // `pc status | head` is normal usage
    throw err;
  }
}

function json(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

/** Warnings go to stderr so `--json` stays pure JSON on stdout. */
function warn(s) {
  process.stderr.write(`⚠ ${s}\n`);
}

function rel(paths, file) {
  return file.startsWith(paths.root + sep) ? file.slice(paths.root.length + 1) : file;
}

// ─────────────────────────────────────────────────────────────────────────────
// task
// ─────────────────────────────────────────────────────────────────────────────

function taskNew(paths, positional, flags) {
  const title = positional.join(' ').trim();
  if (!title) throw new PcError('task new needs a <title>', 2);
  const cls = need(flags, 'class', 'task new');
  const role = need(flags, 'role', 'task new');
  const scope = (flags.scope || []).map((s) => String(s).trim()).filter(Boolean);
  const gates = flags.gates ? String(flags.gates).split(',').map((s) => s.trim()).filter(Boolean) : [];

  let campaign = '';
  if (flags.campaign) {
    const c = loadCampaign(paths, flags.campaign);
    if (c.data.status === 'closed') {
      throw new PcError(
        `campaign ${c.data.id} is closed${c.data.ended ? ` (ended ${c.data.ended})` : ''} — a closed campaign takes no new tasks.\n` +
          '  Open one with `pc campaign new "<title>"`, or leave this task unattached.',
        1,
      );
    }
    campaign = c.data.id;
  }

  // One writer per file. This is the campaign's main failure mode, so it is checked here
  // rather than by eye: an overlap that reaches two agents is a hand merge and a lost edit.
  const conflicts = scopeConflicts(paths, scope);
  if (conflicts.length && !flags.force) {
    throw new PcError(
      [
        'scope overlap — one writer per file, and these live tasks already claim what this one would write:',
        renderConflicts(conflicts),
        '  If they genuinely need the same file they are one task; otherwise narrow the scope or',
        '  sequence them with `pc task block`. `--force` accepts the overlap deliberately and',
        '  records it in the notes of both tasks.',
      ].join('\n'),
      1,
    );
  }

  const data = {
    id: '__PC_ID__',
    title,
    campaign,
    class: cls,
    role,
    model: flags.model || '',
    status: 'queued',
    owner: flags.owner || 'unassigned',
    scope,
    contract: flags.contract || '',
    gates,
  };
  const body = [
    '## Goal',
    flags.goal || title,
    '',
    '## Done when',
    '- [ ] the goal above is met and every gate listed in the frontmatter passes',
    '',
    '## Notes',
    `- ${nowIso()} — created`,
    '',
  ].join('\n');

  const { id, file } = createRecord(paths.work, 'w', slugify(title), stringifyDoc(data, body, TASK_KEYS));
  logEvent(paths, 'task.new', { id, class: cls, role, campaign: campaign || null, model: flags.model || null });

  // A forced overlap is recorded on both sides, so neither agent can be surprised by it.
  for (const c of conflicts) {
    appendNote(file, `scope overlap with ${c.id} accepted deliberately (--force): ${overlapPhrase(c.overlaps)}`);
    const theirFile = recordPath(paths.work, c.id);
    if (theirFile) {
      appendNote(
        theirFile,
        `scope overlap with ${id} accepted deliberately (--force): ${overlapPhrase(c.overlaps, true)}`,
      );
    }
    logEvent(paths, 'task.scope-overlap-forced', { id, with: c.id, overlaps: c.overlaps });
  }

  if (scope.length === 0) {
    warn(
      `${id} was created with no --scope: it claims no paths, so nothing stops another task writing its files. Add --scope <glob> as soon as you know what it writes.`,
    );
  }

  if (flags.json) {
    json({
      id,
      path: rel(paths, file),
      class: cls,
      role,
      status: 'queued',
      campaign: campaign || null,
      model: flags.model || null,
      scope,
      forced_overlaps: conflicts,
    });
  } else {
    out(`✓ task ${id} created — ${rel(paths, file)}`);
    for (const c of conflicts) out(`  ⚠ overlap with ${c.id} accepted (--force): ${overlapPhrase(c.overlaps)}`);
  }
  return 0;
}

function loadTask(paths, id) {
  const rec = loadRecord(paths.work, id, 'task');
  rec.data.id ||= rec.file.split(sep).pop().replace(/\.md$/, '');
  return rec;
}

function findingsRaisedBy(paths, taskId) {
  return listRecords(paths.findings, 'finding').filter((f) => f.data.raised_by === taskId).length;
}

function taskTransition(paths, verb, positional, flags) {
  const id = positional[0];
  if (!id) throw new PcError(`task ${verb} needs an <id>`, 2);
  const rec = loadTask(paths, id);
  const t = rec.data;
  const now = nowIso();
  let message;
  let changed = true;

  if (verb === 'start') {
    if (t.status === 'running') {
      message = `= task ${t.id} already running since ${t.started || 'unknown'} (no change)`;
      changed = false;
    } else if (t.status === 'done') {
      throw new PcError(
        `task ${t.id} is done — use \`pc task note ${t.id} "<what changed>"\` or open a new task`,
        1,
      );
    } else {
      const owner =
        flags.owner ||
        (process.env.PAPERCLIP_AGENT_ID ? `agent:${process.env.PAPERCLIP_AGENT_ID}` : null) ||
        (t.owner && t.owner !== 'unassigned' ? t.owner : 'unassigned');
      const restarted = t.status === 'failed' || t.status === 'blocked';
      t.status = 'running';
      t.owner = owner;
      t.started = t.started || now;
      delete t.ended;
      delete t.blocked_on;
      message = `▶ task ${t.id} running — owner ${owner}${restarted ? ' (restarted)' : ''}`;
    }
  } else if (verb === 'done' || verb === 'fail') {
    const target = verb === 'done' ? 'done' : 'failed';
    if (t.status === target) {
      message = `= task ${t.id} already ${target} at ${t.ended || 'unknown'} (no change)`;
      changed = false;
    } else {
      t.status = target;
      t.ended = now;
      if (flags.owner) t.owner = flags.owner;
      if (flags.model) t.model = flags.model; // the model it actually ran on, if only now known
      delete t.blocked_on;
      const duration = t.started ? secondsBetween(t.started, t.ended) : null;
      const gatesPassed = flags.gates_passed
        ? String(flags.gates_passed).split(',').map((s) => s.trim()).filter(Boolean)
        : target === 'done'
          ? (Array.isArray(t.gates) ? t.gates : [])
          : [];
      logTask(paths, {
        id: t.id,
        campaign: t.campaign || null,
        class: t.class || 'unclassified',
        role: t.role || 'unassigned',
        model: t.model || null,
        status: target,
        started: t.started || null,
        ended: t.ended,
        duration_s: duration,
        tokens: flags.tokens ? Number(flags.tokens) : null,
        tool_uses: flags.tool_uses ? Number(flags.tool_uses) : null,
        gates_passed: gatesPassed,
        findings_raised: findingsRaisedBy(paths, t.id),
      });
      message =
        target === 'done'
          ? `✓ task ${t.id} done in ${fmtDur(duration)}`
          : `✗ task ${t.id} failed after ${fmtDur(duration)}`;
    }
  } else if (verb === 'block') {
    const on = need(flags, 'on', 'task block');
    if (on !== 'founder') {
      const f = recordPath(paths.findings, on);
      if (!f) throw new PcError(`--on "${on}" is neither "founder" nor a known finding id`, 1);
      flags.on = f.split(sep).pop().replace(/\.md$/, '');
    }
    if (t.status === 'blocked' && t.blocked_on === flags.on) {
      message = `= task ${t.id} already blocked on ${flags.on} (no change)`;
      changed = false;
    } else {
      t.status = 'blocked';
      t.blocked_on = flags.on;
      message = `⛔ task ${t.id} blocked on ${flags.on}`;
    }
  } else if (verb === 'unblock') {
    if (t.status !== 'blocked') {
      message = `= task ${t.id} is ${t.status}, not blocked (no change)`;
      changed = false;
    } else {
      const was = t.blocked_on;
      delete t.blocked_on;
      t.status = t.started ? 'running' : 'queued';
      message = `▶ task ${t.id} unblocked (was blocked on ${was}) — now ${t.status}`;
    }
  } else {
    throw new PcError(`unknown task verb: ${verb}`, 2);
  }

  if (changed) saveRecord(rec, TASK_KEYS);
  if (flags.note) appendNote(rec.file, flags.note);
  else if (changed) appendNote(rec.file, `status → ${t.status}`);
  logEvent(paths, `task.${verb}`, { id: t.id, status: t.status, changed });

  if (flags.json) json({ id: t.id, status: t.status, changed, message, path: rel(paths, rec.file) });
  else out(message);
  return 0;
}

function taskNote(paths, positional, flags) {
  const id = positional[0];
  const text = positional.slice(1).join(' ').trim() || flags.note;
  if (!id || !text) throw new PcError('task note needs an <id> and <text>', 2);
  const rec = loadTask(paths, id);
  const line = appendNote(rec.file, text);
  logEvent(paths, 'task.note', { id: rec.data.id });
  if (flags.json) json({ id: rec.data.id, note: line, path: rel(paths, rec.file) });
  else out(`✎ task ${rec.data.id} note appended — ${line}`);
  return 0;
}

function taskShow(paths, positional, flags) {
  const id = positional[0];
  if (!id) throw new PcError('task show needs an <id>', 2);
  const rec = loadTask(paths, id);
  const t = rec.data;
  if (flags.json) {
    json({
      ...t,
      scope: Array.isArray(t.scope) ? t.scope : t.scope ? [t.scope] : [],
      gates: Array.isArray(t.gates) ? t.gates : t.gates ? [t.gates] : [],
      goal: section(rec.body, 'Goal'),
      done_when: section(rec.body, 'Done when').split('\n').filter(Boolean),
      notes: notesOf(rec.body),
      path: rel(paths, rec.file),
    });
    return 0;
  }
  out(`${t.id}  [${t.status}]  ${t.class} · ${t.role} · owner ${t.owner || 'unassigned'}`);
  out(`  ${t.title || ''}`);
  if (t.campaign) out(`  campaign ${t.campaign}`);
  if (t.model) out(`  model ${t.model}`);
  if (t.started) out(`  started ${t.started}${t.ended ? `  ended ${t.ended}  (${fmtDur(secondsBetween(t.started, t.ended))})` : ''}`);
  if (t.blocked_on) out(`  blocked on ${t.blocked_on}`);
  if (t.contract) out(`  contract ${t.contract}`);
  const scope = Array.isArray(t.scope) ? t.scope : t.scope ? [t.scope] : [];
  if (scope.length) out(`  scope ${scope.join(', ')}`);
  const gates = Array.isArray(t.gates) ? t.gates : t.gates ? [t.gates] : [];
  if (gates.length) out(`  gates ${gates.join(', ')}`);
  const goal = section(rec.body, 'Goal');
  if (goal) {
    out('');
    out('  Goal');
    for (const l of goal.split('\n')) out(`    ${l}`);
  }
  const notes = notesOf(rec.body);
  if (notes.length) {
    out('');
    out(`  Notes (${notes.length})`);
    for (const n of notes.slice(-8)) out(`    - ${n}`);
  }
  out('');
  out(`  ${rel(paths, rec.file)}`);
  return 0;
}

function taskList(paths, _positional, flags) {
  let tasks = listRecords(paths.work, 'task');
  if (flags.status) tasks = tasks.filter((t) => t.data.status === flags.status);
  if (flags.class) tasks = tasks.filter((t) => t.data.class === flags.class);
  if (flags.role) tasks = tasks.filter((t) => t.data.role === flags.role);
  if (flags.campaign) {
    const c = loadCampaign(paths, flags.campaign);
    tasks = tasks.filter((t) => t.data.campaign === c.data.id);
  }
  if (flags.json) {
    json(
      tasks.map((t) => ({
        id: t.data.id,
        title: t.data.title || '',
        campaign: t.data.campaign || null,
        class: t.data.class || '',
        role: t.data.role || '',
        model: t.data.model || null,
        status: t.data.status || '',
        owner: t.data.owner || 'unassigned',
        started: t.data.started || null,
        ended: t.data.ended || null,
        blocked_on: t.data.blocked_on || null,
        path: rel(paths, t.file),
      })),
    );
    return 0;
  }
  if (tasks.length === 0) {
    out('no tasks match');
    return 0;
  }
  const w = Math.max(...tasks.map((t) => t.data.id.length));
  for (const t of tasks) {
    out(
      `${t.data.id.padEnd(w)}  ${String(t.data.status || '?').padEnd(7)}  ${String(t.data.class || '').padEnd(14)}  ${t.data.title || ''}`,
    );
  }
  out(`${tasks.length} task(s)`);
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// finding
// ─────────────────────────────────────────────────────────────────────────────

function readStdin() {
  try {
    if (process.stdin.isTTY) return '';
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function findingNew(paths, positional, flags) {
  const from = need(flags, 'from', 'finding new');
  const area = need(flags, 'area', 'finding new');
  const severity = oneOf(need(flags, 'severity', 'finding new'), SEVERITIES, 'severity');
  const title = (flags.title || positional.join(' ')).trim();
  if (!title) throw new PcError('finding new needs --title', 2);

  const fromTask = recordPath(paths.work, from);
  const raisedBy = fromTask ? fromTask.split(sep).pop().replace(/\.md$/, '') : from;

  const stdin = readStdin().trim();
  let body;
  if (stdin.includes('## ')) {
    body = `${stdin}\n`;
  } else {
    body = [
      '## What',
      stdin || title,
      '',
      '## Evidence',
      '```',
      flags.evidence || '(paste the verbatim command and its error)',
      '```',
      '',
      '## Suggested fix',
      flags.fix || '(none proposed)',
      '',
    ].join('\n');
  }
  const data = {
    id: '__PC_ID__',
    title,
    raised_by: raisedBy,
    owner_area: area,
    owner_task: flags.owner_task || 'unassigned',
    severity,
    status: 'open',
  };
  const { id, file } = createRecord(
    paths.findings,
    'f',
    slugify(title),
    stringifyDoc(data, body, ['id', 'title', ...FINDING_KEYS.slice(1)]),
  );
  logEvent(paths, 'finding.new', { id, raised_by: raisedBy, severity, area });
  if (flags.json) json({ id, path: rel(paths, file), severity, owner_area: area, raised_by: raisedBy });
  else out(`✓ finding ${id} raised (${severity}, ${area}) — ${rel(paths, file)}`);
  return 0;
}

function findingTransition(paths, verb, positional, flags) {
  const id = positional[0];
  if (!id) throw new PcError(`finding ${verb} needs an <id>`, 2);
  const rec = loadRecord(paths.findings, id, 'finding');
  rec.data.id ||= rec.file.split(sep).pop().replace(/\.md$/, '');
  const f = rec.data;
  let message;
  let note = '';
  let changed = true;

  if (verb === 'claim') {
    const by = need(flags, 'by', 'finding claim');
    const t = recordPath(paths.work, by);
    const byId = t ? t.split(sep).pop().replace(/\.md$/, '') : by;
    if (f.status === 'claimed' && f.owner_task === byId) {
      message = `= finding ${f.id} already claimed by ${byId} (no change)`;
      changed = false;
    } else if (f.status === 'claimed' && f.owner_task && f.owner_task !== 'unassigned' && !flags.force) {
      throw new PcError(
        `finding ${f.id} is already claimed by ${f.owner_task} — pass --force to reassign it to ${byId}`,
        1,
      );
    } else {
      f.status = 'claimed';
      f.owner_task = byId;
      note = `claimed by ${byId}`;
      message = `→ finding ${f.id} claimed by ${byId}`;
    }
  } else if (verb === 'fix') {
    if (f.status === 'fixed') {
      message = `= finding ${f.id} already fixed (no change)`;
      changed = false;
    } else {
      f.status = 'fixed';
      note = 'marked fixed';
      message = `✓ finding ${f.id} fixed`;
    }
  } else if (verb === 'close') {
    const reason = need(flags, 'reason', 'finding close');
    if (f.status === 'wontfix') {
      message = `= finding ${f.id} already closed as wontfix (no change)`;
      changed = false;
    } else {
      f.status = 'wontfix';
      f.close_reason = reason;
      note = `closed as wontfix — ${reason}`;
      message = `⊘ finding ${f.id} closed as wontfix — ${reason}`;
    }
  } else {
    throw new PcError(`unknown finding verb: ${verb}`, 2);
  }

  if (changed) saveRecord(rec, ['id', 'title', ...FINDING_KEYS.slice(1), 'close_reason']);
  if (flags.note) appendNote(rec.file, flags.note);
  else if (changed) appendNote(rec.file, note);
  logEvent(paths, `finding.${verb}`, { id: f.id, status: f.status, changed });
  if (flags.json) json({ id: f.id, status: f.status, changed, message, path: rel(paths, rec.file) });
  else out(message);
  return 0;
}

function findingList(paths, _positional, flags) {
  let items = listRecords(paths.findings, 'finding');
  if (flags.status) items = items.filter((f) => f.data.status === flags.status);
  if (flags.area) items = items.filter((f) => String(f.data.owner_area || '').includes(flags.area));
  if (flags.severity) items = items.filter((f) => f.data.severity === flags.severity);
  if (flags.json) {
    json(
      items.map((f) => ({
        id: f.data.id,
        title: f.data.title || '',
        raised_by: f.data.raised_by || '',
        owner_area: f.data.owner_area || '',
        owner_task: f.data.owner_task || 'unassigned',
        severity: f.data.severity || '',
        status: f.data.status || '',
        path: rel(paths, f.file),
      })),
    );
    return 0;
  }
  if (items.length === 0) {
    out('no findings match');
    return 0;
  }
  for (const f of items) {
    out(
      `${f.data.id}  ${String(f.data.severity || '').padEnd(7)}  ${String(f.data.status || '').padEnd(7)}  ${f.data.owner_area || ''}`,
    );
    out(`    ${f.data.title || section(f.body, 'What').split('\n')[0] || ''}`);
  }
  out(`${items.length} finding(s)`);
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// campaign — the thing a fan-out belongs to
// ─────────────────────────────────────────────────────────────────────────────

function loadCampaign(paths, ref) {
  const file = recordPath(paths.campaigns, ref);
  if (!file) {
    throw new PcError(`no campaign matching "${ref}" in ${rel(paths, paths.campaigns)} — see \`pc campaign list\``, 1);
  }
  const { data, body, order } = parseFrontmatter(readFileSync(file, 'utf8'));
  data.id ||= file.split(sep).pop().replace(/\.md$/, '');
  return { file, data, body, order };
}

/** Membership lives on the task (`campaign:`), so this is always the live truth. */
function campaignTasks(paths, id) {
  return listRecords(paths.work, 'task').filter((t) => t.data.campaign === id);
}

function openFindingsFrom(paths, taskIds) {
  const from = new Set(taskIds);
  return listRecords(paths.findings, 'finding').filter((f) => OPEN_FINDING(f) && from.has(f.data.raised_by));
}

function campaignRollup(paths, id) {
  const tasks = campaignTasks(paths, id);
  const count = (s) => tasks.filter((t) => t.data.status === s).length;
  return {
    tasks,
    open_findings: openFindingsFrom(paths, tasks.map((t) => t.data.id)),
    counts: {
      total: tasks.length,
      blocked: count('blocked'),
      running: count('running'),
      queued: count('queued'),
      done: count('done'),
      failed: count('failed'),
    },
  };
}

function campaignNew(paths, positional, flags) {
  const title = positional.join(' ').trim();
  if (!title) throw new PcError('campaign new needs a <title>', 2);
  const data = {
    id: '__PC_ID__',
    title,
    status: 'running',
    contract: flags.contract || '',
    started: nowIso(),
  };
  const body = [
    '## Goal',
    flags.goal || title,
    '',
    '## Tasks',
    'The live list is `pc campaign show` — it reads every task whose `campaign:` names this one.',
    'Write the intended decomposition here before you fan out, one line per task and its paths.',
    '',
    '## Notes',
    `- ${nowIso()} — created`,
    '',
  ].join('\n');

  const { id, file } = createRecord(
    paths.campaigns,
    'c',
    slugify(title),
    stringifyDoc(data, body, CAMPAIGN_KEYS),
  );
  logEvent(paths, 'campaign.new', { id, contract: flags.contract || null });
  if (!flags.contract) {
    warn(`${id} names no --contract: every drift in a campaign happens where the contract was silent.`);
  }
  if (flags.json) json({ id, path: rel(paths, file), status: 'running', contract: flags.contract || null });
  else out(`✓ campaign ${id} created — ${rel(paths, file)}`);
  return 0;
}

function campaignClose(paths, positional, flags) {
  const ref = positional[0];
  if (!ref) throw new PcError('campaign close needs an <id>', 2);
  const rec = loadCampaign(paths, ref);
  const c = rec.data;
  if (c.status === 'closed') {
    const message = `= campaign ${c.id} already closed at ${c.ended || 'unknown'} (no change)`;
    if (flags.json) json({ id: c.id, status: 'closed', changed: false, message, path: rel(paths, rec.file) });
    else out(message);
    return 0;
  }

  const { tasks, open_findings: openF, counts } = campaignRollup(paths, c.id);
  const unfinished = tasks.filter((t) => !TERMINAL.includes(t.data.status));
  const unresolved = unfinished.length > 0 || openF.length > 0;

  if (unresolved) {
    const L = [`campaign ${c.id} still has open work — refusing to close it`];
    if (unfinished.length) {
      L.push(`  tasks not done or failed (${unfinished.length})`);
      for (const t of unfinished) {
        L.push(
          `      ${t.data.id}  ${t.data.status}${t.data.blocked_on ? ` on ${t.data.blocked_on}` : ''}  ${t.data.title || ''}`,
        );
      }
    }
    if (openF.length) {
      L.push(`  findings its tasks raised, still open (${openF.length})`);
      for (const f of openF) {
        L.push(`      ${f.data.id}  ${f.data.severity || ''}  ${f.data.status}  ${f.data.title || ''}`);
      }
    }
    if (!flags.force) {
      L.push('  Finish or fail every task, and fix or close every finding, then close the campaign.');
      L.push('  `--force --reason "<why>"` closes over them and records the reason in the campaign notes.');
      throw new PcError(L.join('\n'), 1);
    }
    if (!flags.reason) {
      throw new PcError(
        'campaign close --force needs --reason "<why you are closing over open work>" — a forced close with no reason is a lie in the ledger',
        2,
      );
    }
  }

  c.status = 'closed';
  c.ended = nowIso();
  saveRecord(rec, CAMPAIGN_KEYS);
  const note = unresolved
    ? `closed by --force over open work — ${flags.reason} (${unfinished.length} task(s) unfinished, ${openF.length} finding(s) open)`
    : `closed — ${counts.total} task(s), all finished, no open findings`;
  appendNote(rec.file, note);
  logEvent(paths, 'campaign.close', {
    id: c.id,
    forced: Boolean(unresolved),
    unfinished: unfinished.length,
    open_findings: openF.length,
  });

  const message = unresolved
    ? `⚠ campaign ${c.id} closed over open work (--force) — ${flags.reason}`
    : `✓ campaign ${c.id} closed — ${counts.total} task(s), no open findings`;
  if (flags.json) {
    json({
      id: c.id,
      status: 'closed',
      changed: true,
      forced: Boolean(unresolved),
      reason: unresolved ? flags.reason : null,
      unfinished: unfinished.map((t) => t.data.id),
      open_findings: openF.map((f) => f.data.id),
      message,
      path: rel(paths, rec.file),
    });
  } else {
    out(message);
  }
  return 0;
}

function campaignList(paths, _positional, flags) {
  const campaigns = listRecords(paths.campaigns, 'campaign');
  const rows = campaigns.map((c) => {
    const { counts, open_findings: openF } = campaignRollup(paths, c.data.id);
    return {
      id: c.data.id,
      title: c.data.title || '',
      status: c.data.status || 'running',
      contract: c.data.contract || null,
      started: c.data.started || null,
      ended: c.data.ended || null,
      counts,
      open_findings: openF.length,
      path: rel(paths, c.file),
    };
  });
  if (flags.json) {
    json(rows);
    return 0;
  }
  if (rows.length === 0) {
    out('no campaigns yet — `pc campaign new "<title>" --contract <path>` groups a fan-out');
    return 0;
  }
  const w = Math.max(...rows.map((r) => r.id.length));
  for (const r of rows) {
    out(`${r.id.padEnd(w)}  ${r.status.padEnd(7)}  ${campaignCountLine(r.counts, r.open_findings)}  ${r.title}`);
  }
  out(`${rows.length} campaign(s)`);
  return 0;
}

function campaignCountLine(counts, openFindings) {
  const parts = [];
  if (counts.blocked) parts.push(`${counts.blocked} blocked`);
  if (counts.running) parts.push(`${counts.running} running`);
  if (counts.queued) parts.push(`${counts.queued} queued`);
  if (counts.done) parts.push(`${counts.done} done`);
  if (counts.failed) parts.push(`${counts.failed} failed`);
  if (parts.length === 0) parts.push('no tasks');
  if (openFindings) parts.push(`${openFindings} open finding${openFindings === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function campaignShow(paths, positional, flags) {
  const ref = positional[0];
  if (!ref) throw new PcError('campaign show needs an <id>', 2);
  const rec = loadCampaign(paths, ref);
  const c = rec.data;
  const { tasks, open_findings: openF, counts } = campaignRollup(paths, c.id);

  if (flags.json) {
    json({
      ...c,
      counts,
      goal: section(rec.body, 'Goal'),
      tasks: tasks.map((t) => ({
        id: t.data.id,
        title: t.data.title || '',
        status: t.data.status || '',
        class: t.data.class || '',
        role: t.data.role || '',
        model: t.data.model || null,
        owner: t.data.owner || 'unassigned',
        blocked_on: t.data.blocked_on || null,
      })),
      open_findings: openF.map((f) => ({
        id: f.data.id,
        title: f.data.title || '',
        severity: f.data.severity || '',
        status: f.data.status || '',
        raised_by: f.data.raised_by || '',
      })),
      notes: notesOf(rec.body),
      path: rel(paths, rec.file),
    });
    return 0;
  }

  out(`${c.id}  [${c.status || 'running'}]  ${c.title || ''}`);
  out(`  ${campaignCountLine(counts, openF.length)}`);
  if (c.contract) out(`  contract ${c.contract}`);
  out(`  started ${c.started || 'unknown'}${c.ended ? `  ended ${c.ended}` : ''}`);
  const goal = section(rec.body, 'Goal');
  if (goal) {
    out('');
    out('  Goal');
    for (const l of goal.split('\n')) out(`    ${l}`);
  }
  out('');
  out(`  TASKS (${tasks.length})`);
  if (tasks.length === 0) out(`    (none attached — \`pc task new … --campaign ${c.id}\`)`);
  const MARK = { done: '✓', failed: '✗', blocked: '⛔', running: '▶' };
  const w = Math.max(0, ...tasks.map((t) => String(t.data.id).length));
  for (const t of tasks) {
    const mark = MARK[t.data.status] || '·';
    out(`    ${mark} ${String(t.data.id).padEnd(w)}  ${String(t.data.status || '').padEnd(7)}  ${t.data.title || ''}`);
  }
  out('');
  out(`  OPEN FINDINGS RAISED BY THIS CAMPAIGN (${openF.length})`);
  if (openF.length === 0) out('    (none)');
  for (const f of openF) {
    out(`    ${f.data.id}  ${String(f.data.severity || '').padEnd(7)}  ${f.data.status}  ${f.data.title || ''}`);
  }
  const notes = notesOf(rec.body);
  if (notes.length) {
    out('');
    out(`  Notes (${notes.length})`);
    for (const n of notes.slice(-8)) out(`    - ${n}`);
  }
  out('');
  out(`  ${rel(paths, rec.file)}`);
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// scope — test a partition before anything is created
// ─────────────────────────────────────────────────────────────────────────────

function cmdScope(paths, positional, flags) {
  const verb = positional[0];
  if (verb !== 'check') {
    process.stderr.write(`pc: unknown scope verb "${verb ?? ''}"\n\n${USAGE}\n`);
    return 2;
  }
  const globs = positional.slice(1).filter((g) => String(g).trim() !== '');
  if (globs.length === 0) {
    throw new PcError('scope check needs at least one <glob> — quote it so your shell does not expand it', 2);
  }
  const conflicts = scopeConflicts(paths, globs);
  if (flags.json) {
    json({ globs, clear: conflicts.length === 0, conflicts });
    return conflicts.length ? 1 : 0;
  }
  if (conflicts.length === 0) {
    out(`✓ no overlap — ${globs.join(', ')} is free of every queued, running and blocked task.`);
    return 0;
  }
  out(`✗ scope overlap — ${globs.join(', ')} would give these paths a second writer:`);
  out(renderConflicts(conflicts));
  out('  `pc task new` refuses this partition. Narrow it, fold the work into one task, or');
  out('  sequence it with `pc task block`; `--force` on `pc task new` accepts it deliberately.');
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// status
// ─────────────────────────────────────────────────────────────────────────────

const OPEN_FINDING = (f) => f.data.status === 'open' || f.data.status === 'claimed';

function cmdStatus(paths, _positional, flags) {
  const tasks = listRecords(paths.work, 'task');
  const findings = listRecords(paths.findings, 'finding');
  const campaigns = listRecords(paths.campaigns, 'campaign');
  const rows = readJsonl(paths.tasksLog);
  const now = nowIso();

  // Group by campaign in every bucket, unattached last, so a fan-out reads as one thing.
  const order = new Map(campaigns.map((c, i) => [c.data.id, i]));
  const rank = (t) => {
    const c = t.data.campaign;
    if (!c) return campaigns.length + 1; // unattached: always last
    return order.has(c) ? order.get(c) : campaigns.length; // names a campaign that is gone
  };
  const grouped = (list) =>
    [...list].sort((a, b) => rank(a) - rank(b) || String(a.data.id).localeCompare(String(b.data.id)));

  const by = (s) => grouped(tasks.filter((t) => t.data.status === s));
  const blocked = by('blocked');
  const running = by('running');
  const queued = by('queued');
  const finished = tasks
    .filter((t) => TERMINAL.includes(t.data.status))
    .sort((a, b) => String(b.data.ended || '').localeCompare(String(a.data.ended || '')))
    .slice(0, 5);
  const open = findings.filter(OPEN_FINDING);

  if (flags.json) {
    const shape = (t) => ({
      id: t.data.id,
      title: t.data.title || '',
      campaign: t.data.campaign || null,
      class: t.data.class || '',
      role: t.data.role || '',
      model: t.data.model || null,
      status: t.data.status,
      owner: t.data.owner || 'unassigned',
      started: t.data.started || null,
      ended: t.data.ended || null,
      blocked_on: t.data.blocked_on || null,
      elapsed_s: t.data.started && !t.data.ended ? secondsBetween(t.data.started, now) : null,
      duration_s: t.data.started && t.data.ended ? secondsBetween(t.data.started, t.data.ended) : null,
      estimate: estimateFor(rows, t.data.class || 'unclassified'),
    });
    const areas = {};
    for (const f of open) {
      const a = f.data.owner_area || '(unassigned area)';
      (areas[a] ||= []).push({
        id: f.data.id,
        title: f.data.title || '',
        severity: f.data.severity || '',
        status: f.data.status || '',
        raised_by: f.data.raised_by || '',
        owner_task: f.data.owner_task || 'unassigned',
      });
    }
    json({
      generated: now,
      root: paths.root,
      counts: {
        blocked: blocked.length,
        running: running.length,
        queued: queued.length,
        done: tasks.filter((t) => t.data.status === 'done').length,
        failed: tasks.filter((t) => t.data.status === 'failed').length,
        open_findings: open.length,
        campaigns_running: campaigns.filter((c) => (c.data.status || 'running') === 'running').length,
      },
      campaigns: campaigns.map((c) => {
        const roll = campaignRollup(paths, c.data.id);
        return {
          id: c.data.id,
          title: c.data.title || '',
          status: c.data.status || 'running',
          contract: c.data.contract || null,
          counts: roll.counts,
          open_findings: roll.open_findings.length,
        };
      }),
      unattached_tasks: tasks.filter((t) => !t.data.campaign).length,
      blocked: blocked.map(shape),
      running: running.map(shape),
      queued: queued.map(shape),
      recently_finished: finished.map(shape),
      open_findings_by_area: areas,
    });
    return 0;
  }

  const tag = (t) => (t.data.campaign ? ` · ${t.data.campaign}` : '');

  out(`Paperclip ledger — ${paths.root}`);
  out(`${now}   ${blocked.length} blocked · ${running.length} running · ${queued.length} queued · ${open.length} open findings`);
  out('');

  const runningCampaigns = campaigns.filter((c) => (c.data.status || 'running') === 'running');
  out(`CAMPAIGNS (${runningCampaigns.length} running)`);
  if (campaigns.length === 0) out('  (none — `pc campaign new "<title>"` groups a fan-out)');
  for (const c of campaigns) {
    const roll = campaignRollup(paths, c.data.id);
    out(
      `  ${c.data.id}  ${String(c.data.status || 'running').padEnd(7)}  ${campaignCountLine(roll.counts, roll.open_findings.length)}  — ${c.data.title || ''}`,
    );
  }
  const unattached = tasks.filter((t) => !t.data.campaign);
  if (campaigns.length && unattached.length) out(`  (unattached)      ${unattached.length} task(s), listed last below`);
  out('');

  out(`BLOCKED (${blocked.length})`);
  if (blocked.length === 0) out('  (none)');
  for (const t of blocked) {
    const on = t.data.blocked_on || 'unknown';
    const what = on === 'founder' ? 'the Founder' : findingTitle(findings, on);
    out(`  ${t.data.id}  ← ${on}  ${what}`);
    out(`      ${t.data.title || ''}   [${t.data.role || ''} · ${t.data.owner || 'unassigned'}${tag(t)}]`);
  }
  out('');

  out(`RUNNING (${running.length})`);
  if (running.length === 0) out('  (none)');
  for (const t of running) {
    const el = t.data.started ? secondsBetween(t.data.started, now) : null;
    const est = estimateFor(rows, t.data.class || 'unclassified');
    const estStr = est
      ? `est ~${fmtDur(est.median_s)} (n=${est.n}${est.confident ? '' : ', thin'})`
      : `no estimate for ${t.data.class || 'unclassified'}`;
    const over = est && el !== null && el > est.max_s ? '  ⚠ past the slowest sample' : '';
    out(`  ${t.data.id}  ${fmtDur(el)} elapsed · ${estStr}${over}`);
    out(`      ${t.data.title || ''}   [${t.data.role || ''} · ${t.data.owner || 'unassigned'}${tag(t)}]`);
  }
  out('');

  out(`QUEUED (${queued.length})`);
  if (queued.length === 0) out('  (none)');
  for (const t of queued) {
    out(
      `  ${t.data.id}  ${t.data.class || ''} · ${t.data.role || ''}  ${t.data.title || ''}${t.data.campaign ? `   [${t.data.campaign}]` : ''}`,
    );
  }
  out('');

  out(`LAST FINISHED (${finished.length})`);
  if (finished.length === 0) out('  (none)');
  for (const t of finished) {
    const mark = t.data.status === 'done' ? '✓' : '✗';
    const d = t.data.started && t.data.ended ? fmtDur(secondsBetween(t.data.started, t.data.ended)) : '—';
    out(`  ${mark} ${t.data.id}  ${d}  ${t.data.title || ''}`);
  }
  out('');

  out(`OPEN FINDINGS (${open.length})`);
  if (open.length === 0) out('  (none)');
  const areas = new Map();
  for (const f of open) {
    const a = f.data.owner_area || '(unassigned area)';
    if (!areas.has(a)) areas.set(a, []);
    areas.get(a).push(f);
  }
  for (const [area, items] of [...areas.entries()].sort()) {
    out(`  ${area}`);
    for (const f of items) {
      const owner = f.data.owner_task && f.data.owner_task !== 'unassigned' ? `claimed by ${f.data.owner_task}` : 'unclaimed';
      out(`    ${f.data.id}  ${String(f.data.severity || '').padEnd(7)}  ${f.data.title || ''}`);
      out(`        from ${f.data.raised_by || '?'} · ${owner}`);
    }
  }
  return 0;
}

function findingTitle(findings, id) {
  const f = findings.find((x) => x.data.id === id);
  return f ? `— ${f.data.title || ''} (${f.data.severity || ''})` : '— (finding not found)';
}

// ─────────────────────────────────────────────────────────────────────────────
// estimate
// ─────────────────────────────────────────────────────────────────────────────

function cmdEstimate(paths, positional, flags) {
  const rows = readJsonl(paths.tasksLog);
  const all = estimates(rows);
  const wanted = positional[0];
  const list = wanted ? all.filter((e) => e.class === wanted) : all;

  if (flags.json) {
    json({
      generated: nowIso(),
      source: rel(paths, paths.tasksLog),
      total_records: rows.length,
      classes: wanted && list.length === 0 ? [] : list,
      ...(wanted && list.length === 0 ? { requested: wanted, samples: 0 } : {}),
    });
    return 0;
  }
  if (wanted && list.length === 0) {
    out(`no samples for class "${wanted}" — nothing to estimate from yet.`);
    out(`Record one by running a task of that class through \`pc task done\`.`);
    return 0;
  }
  if (list.length === 0) {
    out(`no finished tasks in ${rel(paths, paths.tasksLog)} yet — no estimates.`);
    return 0;
  }
  out(`Estimates from ${rel(paths, paths.tasksLog)} (${rows.length} finished task record(s))`);
  out('');
  const anyTokens = list.some((e) => e.tokens_n > 0);
  const w = Math.max(5, ...list.map((e) => e.class.length));
  const tokCol = anyTokens ? `  ${'tokens'.padEnd(13)}` : '';
  out(`${'class'.padEnd(w)}  ${'median'.padEnd(9)}  ${'range'.padEnd(19)}${tokCol}  samples`);
  for (const e of list) {
    const range = `${fmtDur(e.min_s)} – ${fmtDur(e.max_s)}`;
    const n = e.confident
      ? `n=${e.n}${e.seed ? ` (${e.seed} seed)` : ''}`
      : `n=${e.n} — too few to trust (need 3)`;
    const tok = anyTokens
      ? `  ${(e.tokens_n ? `${fmtTokens(e.median_tokens)} (n=${e.tokens_n})` : '—').padEnd(13)}`
      : '';
    out(`${e.class.padEnd(w)}  ${fmtDur(e.median_s).padEnd(9)}  ${range.padEnd(19)}${tok}  ${n}`);
  }
  const thin = list.filter((e) => !e.confident);
  if (thin.length) {
    out('');
    out(`Fewer than three samples: ${thin.map((e) => e.class).join(', ')} — treat those as a guess, not an estimate.`);
  }
  const withModels = list.filter((e) => e.models.length);
  if (withModels.length) {
    out('');
    out(
      `Models: ${withModels.map((e) => `${e.class} — ${e.models.map((m) => `${m.model} (${m.n})`).join(', ')}`).join(' · ')}`,
    );
  }
  if (!anyTokens) {
    out('');
    out('No token counts in this log — median tokens per class is blank until a caller passes');
    out('`--tokens` on `pc task done|fail`. Until then "this class belongs on a cheap model" is');
    out('an assertion, not a measurement. Record `--model` on `pc task new` so it can be compared.');
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// handoff
// ─────────────────────────────────────────────────────────────────────────────

function readIfPresent(file) {
  try {
    return existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
  } catch {
    return null;
  }
}

function cmdHandoff(paths, _positional, flags) {
  const camp = flags.campaign ? loadCampaign(paths, flags.campaign) : null;
  const campaigns = listRecords(paths.campaigns, 'campaign');
  let tasks = listRecords(paths.work, 'task');
  let findings = listRecords(paths.findings, 'finding');
  if (camp) {
    tasks = tasks.filter((t) => t.data.campaign === camp.data.id);
    const mine = new Set(tasks.map((t) => t.data.id));
    findings = findings.filter((f) => mine.has(f.data.raised_by));
  }
  const rows = readJsonl(paths.tasksLog);
  const now = nowIso();
  const live = tasks.filter((t) => !TERMINAL.includes(t.data.status));
  const done = tasks.filter((t) => TERMINAL.includes(t.data.status));
  const open = findings.filter(OPEN_FINDING);

  const L = [];
  const p = (s = '') => L.push(s);

  p(`# Campaign handoff — ${paths.root}`);
  p();
  p(`Generated ${now} by \`pc handoff\`.`);
  p();
  if (camp) {
    p(
      `Scoped to campaign **${camp.data.id}** — ${camp.data.title || ''} (${camp.data.status || 'running'}${camp.data.contract ? `, contract \`${camp.data.contract}\`` : ''}).`,
    );
    p('Only this campaign\'s tasks and the findings they raised are below; the estimates are from the whole log.');
    p();
  }
  p(
    'This brief is self-contained on purpose. It exists so a different model, a different',
    );
  p(
    'provider, or a cold session can pick the campaign up with nothing but this file and the',
  );
  p('repository. Everything quoted below is also on disk under `.paperclip/`.');
  p();
  if (camp) {
    const goal = section(camp.body, 'Goal');
    if (goal) {
      p('The campaign\'s goal, from its own file:');
      p();
      p(goal);
      p();
    }
  }
  p('## 0. How to resume');
  p();
  p('1. Read section 1 (state of play) and section 3 (contracts) before touching code.');
  p('2. Pick up the tasks in section 4 that are `running` — they were interrupted, not finished.');
  p('   Re-read each task file, re-run its gates, and continue from its last note.');
  p('3. Clear the blocked tasks in section 4 by resolving the findings they name in section 5.');
  p('4. The ledger is the state. Keep it current as you work:');
  p();
  p('```');
  p('.paperclip/bin/pc status                       # what is blocked, running, queued');
  p('.paperclip/bin/pc task start <id> --owner agent:<you>');
  p('.paperclip/bin/pc task note  <id> "<what you learned>"');
  p('.paperclip/bin/pc task done  <id>              # or: pc task fail <id> --note "<why>"');
  p('.paperclip/bin/pc task block <id> --on <finding-id|founder>');
  p('.paperclip/bin/pc finding new --from <task-id> --area <path> --severity blocker --title "<t>"');
  p('.paperclip/bin/pc estimate                     # how long a class of task really takes');
  p('```');
  p();
  p('Every command writes plain text under `.paperclip/`. Nothing lives only in a transcript.');
  p();

  p('## 1. State of play');
  p();
  p(`| bucket | count |`);
  p(`| --- | --- |`);
  p(`| blocked | ${tasks.filter((t) => t.data.status === 'blocked').length} |`);
  p(`| running (interrupted if this brief was written by a kill) | ${tasks.filter((t) => t.data.status === 'running').length} |`);
  p(`| queued | ${tasks.filter((t) => t.data.status === 'queued').length} |`);
  p(`| done | ${tasks.filter((t) => t.data.status === 'done').length} |`);
  p(`| failed | ${tasks.filter((t) => t.data.status === 'failed').length} |`);
  p(`| open findings | ${open.length} |`);
  p();
  if (!camp) {
    p('Campaigns');
    p();
    if (campaigns.length === 0) {
      p('- None. The tasks below are grouped only by the contract each one names.');
    }
    for (const c of campaigns) {
      const roll = campaignRollup(paths, c.data.id);
      p(
        `- \`${c.data.id}\` — ${c.data.title || ''} (${c.data.status || 'running'}): ${campaignCountLine(roll.counts, roll.open_findings.length)}`,
      );
    }
    const loose = tasks.filter((t) => !t.data.campaign).length;
    if (campaigns.length && loose) p(`- (unattached) — ${loose} task(s) belong to no campaign.`);
    p();
  }

  p('## 2. Cold-start pointers');
  p();
  const pointers = [
    ['.paperclip/PLAYBOOK.md', 'how the company operates — roles, lanes, who decides what'],
    ['.paperclip/STATUS.md', 'the Control Panel — parked decisions, in flight, live, next'],
    ['.paperclip/decisions.md', 'the decision log — why things are the way they are'],
    ['.paperclip/STORY.md', 'deep background: history, strategy, standing concerns'],
    ['.paperclip/briefs/', 'per-campaign briefs handed to agents'],
    ['.paperclip/campaigns/', 'one file per campaign — what a fan-out belongs to'],
    ['.paperclip/work/', 'one file per task (the source of truth for this brief)'],
    ['.paperclip/findings/', 'one file per cross-agent defect'],
    ['.paperclip/research/', 'durable findings from reading, not defects'],
    ['.paperclip/log/tasks.jsonl', 'one line per finished task — the estimate corpus'],
  ];
  for (const [path, what] of pointers) {
    const abs = join(paths.root, path);
    p(`- \`${path}\` — ${what}. ${existsSync(abs) ? 'Present.' : 'Not present in this repo.'}`);
  }
  p();

  p('## 3. Contracts');
  p();
  let contractFiles = isDir(paths.contracts)
    ? readdirSync(paths.contracts).filter((f) => f.endsWith('.md') && f !== 'README.md').sort()
    : [];
  if (camp && camp.data.contract) {
    // A scoped brief quotes the seam this campaign named, not every seam in the repo.
    const base = String(camp.data.contract).split('/').pop();
    if (contractFiles.includes(base)) contractFiles = [base];
  }
  if (contractFiles.length === 0) {
    p('No contract files under `.paperclip/contracts/`. The seams are defined by the code itself;');
    p('read the scope globs in section 4 to see which files each task owns.');
  } else {
    p('Quoted in full — these are the seams every task builds against.');
    for (const f of contractFiles) {
      p();
      p(`### .paperclip/contracts/${f}`);
      p();
      p(fence(readFileSync(join(paths.contracts, f), 'utf8').trim()));
    }
  }
  p();

  p('## 4. Tasks not finished');
  p();
  if (live.length === 0) {
    p(
      camp
        ? `None. Every task in \`${camp.data.id}\` is \`done\` or \`failed\`; see section 6 for what shipped.`
        : 'None. Every task in `.paperclip/work/` is `done` or `failed`; see section 6 for what shipped.',
    );
  }
  for (const t of live) {
    const d = t.data;
    p(`### ${d.id} — ${d.title || ''}`);
    p();
    p(`- status: **${d.status}**${d.blocked_on ? ` (blocked on \`${d.blocked_on}\`)` : ''}`);
    p(`- class: ${d.class || 'unclassified'} · role: ${d.role || 'unassigned'} · owner: ${d.owner || 'unassigned'}`);
    p(`- campaign: ${d.campaign ? `\`${d.campaign}\`` : 'none'} · model: ${d.model || 'not recorded'}`);
    if (d.started) p(`- started: ${d.started} (elapsed ${fmtDur(secondsBetween(d.started, now))} as of this brief)`);
    const est = estimateFor(rows, d.class || 'unclassified');
    p(`- estimate for this class: ${est ? `median ${fmtDur(est.median_s)}, range ${fmtDur(est.min_s)}–${fmtDur(est.max_s)}, n=${est.n}` : 'no samples yet'}`);
    const scope = Array.isArray(d.scope) ? d.scope : d.scope ? [d.scope] : [];
    p(`- scope (write only these paths): ${scope.length ? scope.map((s) => `\`${s}\``).join(', ') : 'not restricted'}`);
    const gates = Array.isArray(d.gates) ? d.gates : d.gates ? [d.gates] : [];
    p(`- gates: ${gates.length ? gates.join(', ') : 'none declared'}`);
    p(`- contract: ${d.contract ? `\`${d.contract}\`` : 'none'}`);
    p(`- file: \`${rel(paths, t.file)}\``);
    p();
    const goal = section(t.body, 'Goal');
    p('Goal');
    p();
    p(goal || '(no Goal section in the task file)');
    p();
    const dw = section(t.body, 'Done when');
    if (dw) {
      p('Done when');
      p();
      p(dw);
      p();
    }
    const notes = notesOf(t.body);
    p(`Notes (${notes.length}, oldest first)`);
    p();
    if (notes.length === 0) p('- (no notes recorded)');
    for (const n of notes) p(`- ${n}`);
    p();
  }

  p('## 5. Open findings');
  p();
  if (open.length === 0) p('None open.');
  for (const f of open) {
    const d = f.data;
    p(`### ${d.id} — ${d.title || ''}`);
    p();
    p(`- severity: **${d.severity || 'unknown'}** · status: ${d.status}`);
    p(`- raised by: ${d.raised_by || 'unknown'} · owning area: \`${d.owner_area || 'unassigned'}\``);
    p(`- owning task: ${d.owner_task || 'unassigned'}`);
    p(`- file: \`${rel(paths, f.file)}\``);
    p();
    p(f.body.trim() || '(empty finding body)');
    p();
  }

  p('## 6. Finished tasks (for context, newest first)');
  p();
  if (done.length === 0) p('None yet.');
  const sortedDone = [...done].sort((a, b) => String(b.data.ended || '').localeCompare(String(a.data.ended || '')));
  for (const t of sortedDone) {
    const d = t.data;
    const dur = d.started && d.ended ? fmtDur(secondsBetween(d.started, d.ended)) : 'unknown duration';
    p(`- ${d.status === 'done' ? '✓' : '✗'} \`${d.id}\` — ${d.title || ''} (${d.class || 'unclassified'}, ${dur})`);
  }
  p();

  p('## 7. Estimates');
  p();
  const est = estimates(rows);
  if (est.length === 0) {
    p('No finished-task records in `.paperclip/log/tasks.jsonl` — nothing to estimate from.');
  } else {
    p('Rolling median and range of wall-clock duration per task class, from the log.');
    p('Treat any class with fewer than three samples as a guess.');
    p();
    p('| class | median | range | median tokens | samples |');
    p('| --- | --- | --- | --- | --- |');
    for (const e of est) {
      const tok = e.tokens_n ? `${fmtTokens(e.median_tokens)} (n=${e.tokens_n})` : 'not recorded';
      p(
        `| ${e.class} | ${fmtDur(e.median_s)} | ${fmtDur(e.min_s)} – ${fmtDur(e.max_s)} | ${tok} | ${e.n}${e.confident ? '' : ' (too few to trust)'} |`,
      );
    }
    if (!est.some((e) => e.tokens_n > 0)) {
      p();
      p('No row in the log carries a token count: pass `--tokens` on `pc task done|fail` and');
      p('`--model` on `pc task new` if you want cost per class to be measured rather than argued.');
    }
  }
  p();
  p('---');
  p();
  p(`End of handoff. Written by \`pc handoff\` from ${rel(paths, paths.pc)} at ${now}.`);
  p();

  const text = `${L.join('\n')}`;
  const defaultName = camp ? `handoff-${camp.data.id}.md` : 'handoff.md';
  const outFile = flags.out ? resolve(process.cwd(), flags.out) : join(paths.pc, defaultName);
  ensureDir(dirname(outFile));
  writeAtomic(outFile, text);
  logEvent(paths, 'handoff', {
    path: outFile,
    campaign: camp ? camp.data.id : null,
    tasks: live.length,
    findings: open.length,
  });
  if (flags.json) {
    json({
      path: rel(paths, outFile),
      campaign: camp ? camp.data.id : null,
      bytes: Buffer.byteLength(text),
      open_tasks: live.length,
      open_findings: open.length,
    });
  } else {
    out(
      `✓ handoff written — ${rel(paths, outFile)}${camp ? ` (campaign ${camp.data.id})` : ''} (${live.length} unfinished task(s), ${open.length} open finding(s), ${Buffer.byteLength(text)} bytes)`,
    );
  }
  return 0;
}

/** Quote a block of text without the fence colliding with backticks inside it. */
function fence(text) {
  let ticks = '```';
  while (text.includes(ticks)) ticks += '`';
  return `${ticks}\n${text}\n${ticks}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// notify
// ─────────────────────────────────────────────────────────────────────────────

function cmdNotify(paths, positional, flags) {
  const event = positional[0];
  const message = positional.slice(1).join(' ').trim();
  if (!event || !message) throw new PcError('notify needs <event> <message>', 2);
  if (!NOTIFY_EVENTS.includes(event)) {
    throw new PcError(`event must be one of: ${NOTIFY_EVENTS.join(' | ')} (got "${event}")`, 2);
  }

  let channel = 'stdout';
  let ok = true;
  let detail = '';
  try {
    const cmd = process.env.PAPERCLIP_NOTIFY_CMD;
    if (cmd && cmd.trim() !== '') {
      channel = 'PAPERCLIP_NOTIFY_CMD';
      const r = spawnSync('sh', ['-c', cmd, 'pc-notify', event, message], {
        stdio: ['ignore', 'inherit', 'inherit'],
        env: { ...process.env, PAPERCLIP_EVENT: event, PAPERCLIP_MESSAGE: message },
        timeout: 15000,
      });
      ok = r.status === 0 && !r.error;
      detail = r.error ? String(r.error.message) : `exit ${r.status}`;
    } else if (process.platform === 'darwin') {
      channel = 'osascript';
      const script = `display notification ${appleString(message)} with title "Paperclip" subtitle ${appleString(event)}`;
      const r = spawnSync('osascript', ['-e', script], { stdio: 'ignore', timeout: 15000 });
      ok = r.status === 0 && !r.error;
      detail = r.error ? String(r.error.message) : `exit ${r.status}`;
    }
  } catch (err) {
    ok = false;
    detail = String(err && err.message);
  }

  try {
    appendLine(paths.eventsLog, {
      ts: nowIso(),
      event: `notify.${event}`,
      message,
      channel,
      delivered: ok,
      ...(ok ? {} : { detail }),
    });
  } catch {
    /* never fail the caller */
  }

  if (flags.json) json({ event, message, channel, delivered: ok, ...(ok ? {} : { detail }) });
  else out(`🔔 ${event}: ${message}${ok ? '' : `  (delivery failed via ${channel}: ${detail} — logged anyway)`}`);
  return 0; // notify never fails its caller
}

function appleString(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage + dispatch
// ─────────────────────────────────────────────────────────────────────────────

const USAGE = `pc — the Paperclip coordination ledger (plain text under .paperclip/)

The tool lives at .paperclip/bin/pc and may always be called by that path.

  pc status [--json]
      The Founder's view: the campaigns, then blocked first (and what each waits
      on), then running (elapsed vs. the estimate for its class), then queued, the
      last five finished, and open findings grouped by owning area. Every bucket is
      grouped by campaign, with unattached tasks last.

  pc campaign new <title> [--contract <path>] [--goal <text>] [--json]
  pc campaign close <id> [--force --reason <text>] [--json]
      Refuses while a task of the campaign is not done or failed, or a finding one
      of its tasks raised is still open — and lists exactly what is unresolved.
  pc campaign list [--json]
  pc campaign show <id> [--json]

  pc task new <title> --class <c> --role <r> [--scope <glob>]... [--campaign <id>]
                      [--contract <path>] [--gates a,b] [--owner <who>]
                      [--model <name>] [--force] [--json]
      Refuses when a --scope glob overlaps the scope of any queued, running or
      blocked task, naming the task and the globs. --force accepts the overlap and
      records it in the notes of BOTH tasks. Warns when a task claims no scope.
  pc task start|done|fail <id> [--owner <who>] [--model <name>] [--tokens <n>]
                               [--tool-uses <n>] [--note <text>] [--json]
  pc task block <id> --on <finding-id|founder> [--note <text>]
  pc task unblock <id> [--note <text>]
  pc task note <id> <text>
  pc task show <id> [--json]
  pc task list [--status s] [--class c] [--role r] [--campaign <id>] [--json]

  pc scope check <glob>... [--json]
      Does this partition collide with a live task? Same answer \`pc task new\`
      gives, before anything is created. Exits 1 on an overlap. Quote the glob.

  pc finding new --from <task-id> --area <path> --severity blocker|defect|nit
                 --title <t>            (body is read from stdin)
  pc finding claim <id> --by <task-id> [--force]
  pc finding fix <id> [--note <text>]
  pc finding close <id> --reason <text>
  pc finding list [--status s] [--area p] [--severity s] [--json]

  pc estimate [<class>] [--json]
      Rolling median and range of duration_s per class, with the sample count, and
      the median tokens where the rows carry them. Says so plainly when a class has
      fewer than three samples, or when nothing in the log carries a token count.

  pc handoff [--campaign <id>] [--out <file>] [--json]
      Writes ONE self-contained brief another model or provider can resume from:
      contracts, every unfinished task, every open finding, the estimates and the
      cold-start pointers. --campaign scopes it to one fan-out.
      Default: .paperclip/handoff.md (or handoff-<campaign-id>.md)

  pc notify blocked|campaign-done|agent-failed <message> [--json]
      Runs $PAPERCLIP_NOTIFY_CMD when set, else macOS osascript, else prints.
      Always appends to .paperclip/log/events.jsonl; never fails the caller.

Campaign statuses: ${CAMPAIGN_STATUSES.join(' | ')}
Task statuses: ${TASK_STATUSES.join(' | ')}
Finding statuses: ${FINDING_STATUSES.join(' | ')}
The ledger is found by walking up from $PWD; $PAPERCLIP_DIR overrides it.`;

export function run(argv, cwd = process.cwd()) {
  const { positional, flags } = parseArgs(argv);
  const group = positional[0];

  if (flags.help || group === 'help' || group === undefined) {
    out(USAGE);
    return group === 'help' || flags.help ? 0 : 2;
  }

  const knownGroups = ['status', 'campaign', 'task', 'scope', 'finding', 'estimate', 'handoff', 'notify'];
  if (!knownGroups.includes(group)) {
    process.stderr.write(`pc: unknown command "${group}"\n\n${USAGE}\n`);
    return 2;
  }

  const pcDir = findLedger(cwd);
  const paths = ledgerPaths(pcDir);
  const rest = positional.slice(1);

  switch (group) {
    case 'status':
      return cmdStatus(paths, rest, flags);
    case 'estimate':
      return cmdEstimate(paths, rest, flags);
    case 'handoff':
      return cmdHandoff(paths, rest, flags);
    case 'notify':
      return cmdNotify(paths, rest, flags);
    case 'scope':
      return cmdScope(paths, rest, flags);
    case 'campaign': {
      const verb = rest[0];
      const args = rest.slice(1);
      switch (verb) {
        case 'new':
          return campaignNew(paths, args, flags);
        case 'close':
          return campaignClose(paths, args, flags);
        case 'list':
          return campaignList(paths, args, flags);
        case 'show':
          return campaignShow(paths, args, flags);
        default:
          process.stderr.write(`pc: unknown campaign verb "${verb ?? ''}"\n\n${USAGE}\n`);
          return 2;
      }
    }
    case 'task': {
      const verb = rest[0];
      const args = rest.slice(1);
      switch (verb) {
        case 'new':
          return taskNew(paths, args, flags);
        case 'start':
        case 'done':
        case 'fail':
        case 'block':
        case 'unblock':
          return taskTransition(paths, verb, args, flags);
        case 'note':
          return taskNote(paths, args, flags);
        case 'show':
          return taskShow(paths, args, flags);
        case 'list':
          return taskList(paths, args, flags);
        default:
          process.stderr.write(`pc: unknown task verb "${verb ?? ''}"\n\n${USAGE}\n`);
          return 2;
      }
    }
    case 'finding': {
      const verb = rest[0];
      const args = rest.slice(1);
      switch (verb) {
        case 'new':
          return findingNew(paths, args, flags);
        case 'claim':
        case 'fix':
        case 'close':
          return findingTransition(paths, verb, args, flags);
        case 'list':
          return findingList(paths, args, flags);
        default:
          process.stderr.write(`pc: unknown finding verb "${verb ?? ''}"\n\n${USAGE}\n`);
          return 2;
      }
    }
    default:
      process.stderr.write(`${USAGE}\n`);
      return 2;
  }
}

function main() {
  // `pc status | head` closes the pipe early; that is not an error.
  process.stdout.on('error', (err) => {
    if (err && err.code === 'EPIPE') process.exit(0);
  });
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (err) {
    if (err instanceof PcError) {
      process.stderr.write(`pc: ${err.message}\n`);
      process.exitCode = err.code;
      return;
    }
    process.stderr.write(`pc: ${err && err.stack ? err.stack : err}\n`);
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly || process.env.PC_FORCE_MAIN === '1') main();

export const __internals = {
  PcError,
  ledgerPaths,
  section,
  notesOf,
  readJsonl,
  scopeConflicts,
  USAGE,
  fileURLToPath,
};
