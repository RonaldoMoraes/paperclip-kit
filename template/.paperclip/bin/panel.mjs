#!/usr/bin/env node
// The company's control panel: STATUS.md + Superpowers' plan progress + decisions + roles +
// memory + git, drawn in the terminal or as an HTML dashboard. Zero dependencies, read-only
// except for --set-role (state.json) and --html (panel.html).
//
//   panel                 the full panel
//   panel --compact       the short one (session start and end)
//   panel --html [path]   write the dashboard (default .paperclip/panel.html) and open it
//   panel --json          the model behind both, for scripts
//   panel --set-role <r>  record the active lens
//   panel --wake [role]   "paperclip on": put a lens on duty (default ceo) and show the compact panel
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, dirname, resolve, basename, relative } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ---------- parsing ----------

const PLACEHOLDER = /^_\(.*\)_$/;

/** STATUS.md → { updated, sections: { [n]: { title, rows?, items? } } } */
export function parseStatus(md) {
  const out = { updated: null, sections: {} };
  const u = md.match(/\*\*Last updated:\*\*\s*(.+)/);
  if (u && !PLACEHOLDER.test(u[1].trim())) out.updated = u[1].trim();
  const parts = md.split(/^## /m).slice(1);
  for (const part of parts) {
    const [head, ...rest] = part.split('\n');
    const m = head.match(/^(\d+)\.\s*(.+)$/);
    if (!m) continue;
    const body = rest.join('\n');
    const sec = { title: m[2].trim() };
    const tableLines = body.split('\n').filter((l) => l.trim().startsWith('|'));
    if (tableLines.length >= 2) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const header = cells(tableLines[0]);
      sec.columns = header;
      sec.rows = tableLines.slice(2).map(cells)
        .filter((c) => c.some((x) => x) && !PLACEHOLDER.test(c[0]))
        .map((c) => Object.fromEntries(header.map((h, i) => [h, c[i] ?? ''])));
    } else {
      sec.items = body.split('\n')
        .map((l) => l.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/)?.[1]?.trim())
        .filter((x) => x && !PLACEHOLDER.test(x));
    }
    out.sections[m[1]] = sec;
  }
  return out;
}

/** A plan file's title and checkbox progress. */
export function planProgress(md) {
  const title = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '(untitled plan)';
  const done = (md.match(/^\s*[-*]\s+\[[xX]\]/gm) ?? []).length;
  const open = (md.match(/^\s*[-*]\s+\[ \]/gm) ?? []).length;
  return { title, done, total: done + open };
}

/** decisions.md → [{ n, date, title }], newest first as written. HTML comments are ignored. */
export function parseDecisions(md) {
  const clean = md.replace(/<!--[\s\S]*?-->/g, '');
  return [...clean.matchAll(/^##\s+(\d+)\s*·\s*([^·\n]+?)\s*·\s*(.+)$/gm)]
    .map((m) => ({ n: m[1], date: m[2].trim(), title: m[3].trim() }));
}

/** A role card's frontmatter. */
export function parseRole(md, file) {
  const fm = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const get = (k) => fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim();
  return { id: basename(file, '.md'), name: get('name') ?? basename(file, '.md'), lane: get('lane') ?? '', color: get('color') ?? 'gray' };
}

// ---------- collecting ----------

export function findRoot(from = process.cwd()) {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, '.paperclip'))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const git = (root, args) => { try { return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };

function listPlans(root) {
  const dirs = ['docs/superpowers/plans', 'docs/plans'];
  const plans = [];
  for (const d of dirs) {
    const abs = join(root, d);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs).filter((x) => x.endsWith('.md'))) {
      const p = join(abs, f);
      plans.push({ path: relative(root, p), mtime: statSync(p).mtimeMs, ...planProgress(readFileSync(p, 'utf8')) });
    }
  }
  return plans.sort((a, b) => b.mtime - a.mtime);
}

async function probeMemory(root) {
  const url = process.env.AI_MEMORY_SERVER_URL || process.env.AI_MEMORY_HOOK_URL || 'http://127.0.0.1:49374';
  let up = false;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 400);
    await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    up = true;
  } catch {}
  const handoff = existsSync(join(root, '.paperclip', 'HANDOFF.md'));
  return { kind: up ? 'ai-memory' : handoff ? 'file' : 'none', url, up, handoffFile: handoff };
}

export async function collect(root, { probe = true } = {}) {
  const pc = join(root, '.paperclip');
  const status = parseStatus(read(join(pc, 'STATUS.md')) ?? '');
  const plans = listPlans(root);
  // Attach plan progress to in-flight rows that name a plan file.
  for (const row of status.sections['2']?.rows ?? []) {
    const cell = row.Plan ?? '';
    const hit = plans.find((p) => cell.includes(p.path) || (cell && cell.replace(/[`\s]/g, '').endsWith(basename(p.path))));
    if (hit) row._plan = { path: hit.path, done: hit.done, total: hit.total };
  }
  const roles = existsSync(join(pc, 'roles'))
    ? readdirSync(join(pc, 'roles')).filter((f) => f.endsWith('.md')).sort().map((f) => parseRole(readFileSync(join(pc, 'roles', f), 'utf8'), f))
    : [];
  let state = {};
  try { state = JSON.parse(read(join(pc, 'state.json')) ?? '{}'); } catch {}
  let name = basename(root);
  try { name = JSON.parse(read(join(root, 'package.json')) ?? '{}').name || name; } catch {}
  const dirty = git(root, ['status', '--porcelain']);
  return {
    name,
    generatedAt: new Date().toISOString(),
    lens: state.role ?? null,
    status,
    plans: plans.slice(0, 6),
    decisions: parseDecisions(read(join(pc, 'decisions.md')) ?? '').slice(0, 5),
    roles,
    memory: probe ? await probeMemory(root) : { kind: 'unknown' },
    git: {
      branch: git(root, ['symbolic-ref', '--short', 'HEAD']) ?? git(root, ['rev-parse', '--short', 'HEAD']),
      dirty: dirty == null ? null : dirty.split('\n').filter(Boolean).length,
      last: git(root, ['log', '-1', '--format=%s · %cr']),
    },
  };
}

// ---------- terminal ----------

const ESC = (c) => (s) => `\x1b[${c}m${s}\x1b[0m`;
const PAINT = { bold: ESC('1'), dim: ESC('2'), red: ESC('31'), green: ESC('32'), yellow: ESC('33'), blue: ESC('34'), magenta: ESC('35'), cyan: ESC('36') };
const ROLE_PAINT = { purple: 'magenta', blue: 'blue', green: 'green', orange: 'yellow', pink: 'magenta', yellow: 'yellow', red: 'red', cyan: 'cyan' };

export function bar(done, total, width = 16) {
  if (!total) return '·'.repeat(width);
  const n = Math.round((done / total) * width);
  return '█'.repeat(n) + '░'.repeat(width - n);
}

export function renderText(m, { color = false, compact = false } = {}) {
  const c = (k, s) => (color ? PAINT[k](s) : s);
  const W = 74;
  const line = (s = '') => `│ ${s}`;
  const out = [];
  const lens = m.lens ? m.roles.find((r) => r.id === m.lens) : null;
  out.push(`╭${'─'.repeat(W)}`);
  out.push(line(`${c('bold', m.name)}  ${c('dim', '· control panel')}${lens ? `   ${c(ROLE_PAINT[lens.color] ?? 'bold', '● ' + lens.name)} ${c('dim', 'on duty')}` : ''}`));
  if (m.status.updated) out.push(line(c('dim', `STATUS updated ${m.status.updated}`)));
  out.push(`├${'─'.repeat(W)}`);

  const waiting = m.status.sections['1']?.rows ?? [];
  out.push(line(`${c(waiting.length ? 'red' : 'green', waiting.length ? '▲' : '✓')} ${c('bold', 'Waiting on you')} ${c('dim', `(${waiting.length})`)}`));
  for (const r of waiting) out.push(line(`   ${r.Decision}${r.Recommendation ? c('dim', `  → ${r.Recommendation}`) : ''}`));

  const flight = m.status.sections['2']?.rows ?? [];
  out.push(line(`${c('yellow', '◆')} ${c('bold', 'In flight')} ${c('dim', `(${flight.length})`)}`));
  for (const r of flight) {
    const p = r._plan;
    out.push(line(`   ${r.Work}${r.Lens ? c('dim', ` · ${r.Lens}`) : ''}${p ? `  ${c('cyan', bar(p.done, p.total, 12))} ${p.done}/${p.total}` : ''}${r.State ? c('dim', `  ${r.State}`) : ''}`));
  }

  if (!compact) {
    const unlinked = m.plans.filter((p) => !flight.some((r) => r._plan?.path === p.path));
    if (unlinked.length) {
      out.push(line(`${c('cyan', '▤')} ${c('bold', 'Plans')}`));
      for (const p of unlinked.slice(0, 4)) out.push(line(`   ${c('cyan', bar(p.done, p.total, 12))} ${String(p.done).padStart(2)}/${String(p.total).padEnd(2)} ${p.title}`));
    }
    if (m.decisions.length) {
      out.push(line(`${c('blue', '◇')} ${c('bold', 'Recent decisions')}`));
      for (const d of m.decisions.slice(0, 3)) out.push(line(`   ${c('dim', `${d.n} · ${d.date}`)}  ${d.title}`));
    }
  }
  const next = m.status.sections['5']?.items ?? [];
  if (next.length) {
    out.push(line(`${c('green', '→')} ${c('bold', 'Next')}`));
    for (const n of next.slice(0, compact ? 2 : 5)) out.push(line(`   ${n}`));
  }
  out.push(`├${'─'.repeat(W)}`);
  if (!compact) out.push(line(`${c('dim', 'Team')}  ${m.roles.map((r) => c(ROLE_PAINT[r.color] ?? 'bold', r.name)).join(c('dim', ' · '))}`));
  const mem = { 'ai-memory': c('green', `ai-memory ● ${m.memory.url}`), file: c('yellow', 'HANDOFF.md (no ai-memory)'), none: c('dim', 'no memory yet'), unknown: c('dim', '—') }[m.memory.kind];
  const g = m.git.branch ? `${m.git.branch}${m.git.dirty ? c('yellow', ` +${m.git.dirty}`) : ''}${!compact && m.git.last ? c('dim', `  ${m.git.last}`) : ''}` : c('dim', 'not a git repo');
  out.push(line(`${c('dim', 'Memory')} ${mem}   ${c('dim', 'Git')} ${g}`));
  out.push(`╰${'─'.repeat(W)}`);
  return out.join('\n');
}

// ---------- html ----------

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const md = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const HUE = { purple: '#7c5cd6', blue: '#2a78d6', green: '#1f9e6e', orange: '#e0782f', pink: '#d4508a', yellow: '#c9a100', red: '#d84a4a', cyan: '#1a9fb5', gray: '#8a918e' };

export function renderHtml(m) {
  const waiting = m.status.sections['1']?.rows ?? [];
  const flight = m.status.sections['2']?.rows ?? [];
  const live = m.status.sections['3']?.items ?? [];
  const done = m.status.sections['4']?.items ?? [];
  const next = m.status.sections['5']?.items ?? [];
  const lens = m.lens ? m.roles.find((r) => r.id === m.lens) : null;
  const progress = (p) => p ? `<div class="prog" title="${p.done} of ${p.total} steps"><i style="width:${p.total ? (100 * p.done / p.total).toFixed(0) : 0}%"></i></div><span class="num">${p.done}/${p.total}</span>` : '';
  const list = (items, empty) => items.length ? `<ul>${items.map((i) => `<li>${md(i)}</li>`).join('')}</ul>` : `<p class="empty">${empty}</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.name)} · Control Panel</title>
<style>
:root{--bg:#f2f4f3;--card:#fff;--ink:#161b19;--ink2:#4e5855;--mute:#7b8581;--rule:#dde2df;--red:#c43d3d;--redbg:#fbeaea;--amber:#9a6a00;--track:#e6ebe8;--fill:#1a9fb5;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0e1211;--card:#161b1a;--ink:#e6ebe9;--ink2:#b5bfbb;--mute:#8e9894;--rule:#29302d;--red:#f07070;--redbg:#2e1818;--amber:#f0c060;--track:#27302d;--fill:#2bb8cf;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:28px 18px 48px;display:grid;gap:18px}
header{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:baseline;justify-content:space-between}
h1{margin:0;font-size:28px;letter-spacing:-.01em}h1 small{font-size:14px;color:var(--mute);font-weight:500;margin-left:8px}
.lens{display:inline-flex;align-items:center;gap:8px;font-weight:600}.lens i{width:10px;height:10px;border-radius:50%}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:16px 18px;display:grid;gap:10px;align-content:start}
.card h2{margin:0;font-size:13px;letter-spacing:.07em;text-transform:uppercase;color:var(--mute)}
.card.alert{border-color:var(--red);background:var(--redbg)}.card.alert h2{color:var(--red)}
ul{margin:0;padding-left:18px;display:grid;gap:4px}.empty{margin:0;color:var(--mute)}
.row{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--rule)}.row:first-of-type{border-top:0}
.row .t{font-weight:600}.row .s{color:var(--ink2);font-size:13px}
.prog{width:110px;height:8px;border-radius:4px;background:var(--track);overflow:hidden}.prog i{display:block;height:100%;background:var(--fill)}
.num{font:12.5px ui-monospace,Menlo,monospace;color:var(--ink2);min-width:42px;text-align:right}
.rec{color:var(--ink2);font-size:13.5px}
.team{display:flex;flex-wrap:wrap;gap:8px}.chip{display:inline-flex;gap:7px;align-items:center;border:1px solid var(--rule);border-radius:999px;padding:4px 10px;font-size:13px}.chip i{width:8px;height:8px;border-radius:50%}
.chip.on{border-color:var(--ink);font-weight:600}
.meta{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:13.5px}.meta dt{color:var(--mute)}.meta dd{margin:0}
code{font:12.5px ui-monospace,Menlo,monospace;background:var(--track);padding:1px 5px;border-radius:4px}
footer{color:var(--mute);font-size:12.5px}
</style></head><body><div class="wrap">
<header><h1>${esc(m.name)}<small>control panel</small></h1>
${lens ? `<span class="lens"><i style="background:${HUE[lens.color] ?? HUE.gray}"></i>${esc(lens.name)} on duty</span>` : ''}</header>
<div class="grid">
<section class="card${waiting.length ? ' alert' : ''}"><h2>Waiting on you · ${waiting.length}</h2>
${waiting.length ? waiting.map((r) => `<div><strong>${md(r.Decision)}</strong>${r['Why it\'s here'] ? `<div class="rec">${md(r["Why it's here"])}</div>` : ''}${r.Recommendation ? `<div class="rec">→ ${md(r.Recommendation)}</div>` : ''}</div>`).join('') : '<p class="empty">Nothing is waiting on you.</p>'}</section>
<section class="card"><h2>In flight · ${flight.length}</h2>
${flight.length ? flight.map((r) => `<div class="row"><div><div class="t">${md(r.Work)}</div><div class="s">${md([r.Lens, r.State].filter(Boolean).join(' · '))}</div></div>${progress(r._plan)}</div>`).join('') : '<p class="empty">Nothing in flight.</p>'}</section>
<section class="card"><h2>Next</h2>${list(next, 'No next moves listed.')}</section>
<section class="card"><h2>Plans</h2>
${m.plans.length ? m.plans.map((p) => `<div class="row"><div><div class="t">${esc(p.title)}</div><div class="s"><code>${esc(p.path)}</code></div></div>${progress(p)}</div>`).join('') : '<p class="empty">No Superpowers plans yet.</p>'}</section>
<section class="card"><h2>Recent decisions</h2>
${m.decisions.length ? `<ul>${m.decisions.map((d) => `<li><span class="num">${esc(d.n)}</span> ${esc(d.title)} <span class="s">· ${esc(d.date)}</span></li>`).join('')}</ul>` : '<p class="empty">No decisions logged.</p>'}</section>
<section class="card"><h2>Live · Done</h2>${list(live, 'Nothing live yet.')}${list(done.slice(0, 6), 'Nothing done yet.')}</section>
<section class="card"><h2>Team</h2><div class="team">${m.roles.map((r) => `<span class="chip${r.id === m.lens ? ' on' : ''}" title="${esc(r.lane)}"><i style="background:${HUE[r.color] ?? HUE.gray}"></i>${esc(r.name)}</span>`).join('')}</div></section>
<section class="card"><h2>Memory · Repo</h2><dl class="meta">
<dt>Memory</dt><dd>${{ 'ai-memory': `ai-memory at <code>${esc(m.memory.url)}</code>`, file: '<code>.paperclip/HANDOFF.md</code> (ai-memory not running)', none: 'none yet', unknown: '—' }[m.memory.kind]}</dd>
<dt>Branch</dt><dd>${esc(m.git.branch ?? '—')}${m.git.dirty ? ` · ${m.git.dirty} uncommitted` : ''}</dd>
<dt>Last commit</dt><dd>${esc(m.git.last ?? '—')}</dd>
<dt>STATUS</dt><dd>${esc(m.status.updated ?? 'never updated')}</dd></dl></section>
</div>
<footer>Generated ${esc(m.generatedAt)} by <code>.paperclip/bin/panel --html</code>. Run it again to refresh.</footer>
</div></body></html>`;
}

// ---------- cli ----------

async function main(argv) {
  const root = findRoot();
  if (!root) { console.error('✗ no .paperclip/ here or above — is the kit installed?'); process.exit(1); }
  const flag = (f) => argv.includes(f);
  const arg = (f) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };

  const setRole = (role) => writeFileSync(join(root, '.paperclip', 'state.json'), JSON.stringify({ role, since: new Date().toISOString() }, null, 2) + '\n');
  if (flag('--set-role')) {
    const role = arg('--set-role');
    if (!role) { console.error('usage: panel --set-role <role>'); process.exit(1); }
    setRole(role);
    console.log(`● ${role} on duty`);
    return;
  }
  if (flag('--wake')) setRole(arg('--wake') ?? 'ceo');
  const model = await collect(root);
  if (flag('--json')) { console.log(JSON.stringify(model, null, 2)); return; }
  if (flag('--html')) {
    const out = resolve(arg('--html') ?? join(root, '.paperclip', 'panel.html'));
    writeFileSync(out, renderHtml(model));
    console.log(`✓ dashboard: ${out}`);
    if (!flag('--no-open') && process.platform === 'darwin') spawn('open', [out], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  const color = process.stdout.isTTY && !process.env.NO_COLOR && !flag('--no-color');
  console.log(renderText(model, { color, compact: flag('--compact') || flag('--wake') }));
}

// Real paths on both sides: through a symlinked directory (macOS /tmp, a linked checkout) the two spellings differ.
const same = (a, b) => { try { return realpathSync(a) === realpathSync(b); } catch { return false; } };
if (process.argv[1] && same(process.argv[1], fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}
