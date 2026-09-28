// node --test .paperclip/bin/panel.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseStatus, planProgress, parseDecisions, parseRole, collect, renderText, renderHtml, bar } from './panel.mjs';

const STATUS = `# Control Panel
> **Last updated:** 2026-09-27 · CTO

## 1. Waiting on the Founder

| Decision | Why it's here | Recommendation |
|---|---|---|
| Ship estoque behind a flag? | touches the paywall | yes, flag on for beta |

## 2. In flight

| Work | Lens | Plan | State |
|---|---|---|---|
| Vehicle inventory v1 | CTO | \`docs/superpowers/plans/estoque.md\` | building |
| _(none yet)_ | | | |

## 3. Live

- _(none yet)_

## 5. Next

1. Import stock from CSV
2. FIPE lookup
`;

test('parseStatus reads tables, lists, the date, and skips placeholders', () => {
  const s = parseStatus(STATUS);
  assert.equal(s.updated, '2026-09-27 · CTO');
  assert.equal(s.sections['1'].rows.length, 1);
  assert.equal(s.sections['1'].rows[0].Recommendation, 'yes, flag on for beta');
  assert.equal(s.sections['2'].rows.length, 1, 'placeholder row dropped');
  assert.deepEqual(s.sections['3'].items, []);
  assert.deepEqual(s.sections['5'].items, ['Import stock from CSV', 'FIPE lookup']);
});

test('parseStatus treats the template placeholder date as never updated', () => {
  assert.equal(parseStatus('> **Last updated:** _(never)_\n').updated, null);
});

test('planProgress counts checked and open steps', () => {
  const p = planProgress('# Estoque plan\n- [x] one\n- [X] two\n  - [ ] three\n* [ ] four\n');
  assert.deepEqual(p, { title: 'Estoque plan', done: 2, total: 4 });
});

test('parseDecisions ignores the commented template entry', () => {
  const d = parseDecisions('# Decisions\n<!-- ## NNN · YYYY-MM-DD · <title> -->\n## 002 · 2026-09-27 · ai-memory is the memory\n## 001 · 2026-09-26 · Superpowers is the engine\n');
  assert.deepEqual(d.map((x) => x.n), ['002', '001']);
  assert.equal(d[0].title, 'ai-memory is the memory');
});

test('parseRole reads the card frontmatter', () => {
  const r = parseRole('---\nname: CTO\nlane: architecture\ncolor: blue\n---\nbody', 'cto.md');
  assert.deepEqual(r, { id: 'cto', name: 'CTO', lane: 'architecture', color: 'blue' });
});

test('bar draws proportionally and handles an empty plan', () => {
  assert.equal(bar(1, 2, 4), '██░░');
  assert.equal(bar(0, 0, 3), '···');
});

test('collect links an in-flight row to its plan and renders both views', async () => {
  const root = mkdtempSync(join(tmpdir(), 'panel-'));
  mkdirSync(join(root, '.paperclip', 'roles'), { recursive: true });
  mkdirSync(join(root, 'docs', 'superpowers', 'plans'), { recursive: true });
  writeFileSync(join(root, '.paperclip', 'STATUS.md'), STATUS);
  writeFileSync(join(root, '.paperclip', 'decisions.md'), '## 001 · 2026-09-26 · Superpowers is the engine\n');
  writeFileSync(join(root, '.paperclip', 'roles', 'cto.md'), '---\nname: CTO\nlane: tech\ncolor: blue\n---\n');
  writeFileSync(join(root, '.paperclip', 'state.json'), '{"role":"cto"}');
  writeFileSync(join(root, 'docs', 'superpowers', 'plans', 'estoque.md'), '# Estoque\n- [x] a\n- [ ] b\n- [ ] c\n');
  const m = await collect(root, { probe: false });
  assert.deepEqual(m.status.sections['2'].rows[0]._plan, { path: 'docs/superpowers/plans/estoque.md', done: 1, total: 3 });
  assert.equal(m.lens, 'cto');
  const text = renderText(m);
  assert.match(text, /Waiting on you \(1\)/);
  assert.match(text, /Vehicle inventory v1 {2}█{4}░{8} 1\/3 {2}CTO · building/);
  assert.match(text, /CTO on duty/);
  const html = renderHtml(m);
  assert.match(html, /Waiting on you · 1/);
  assert.match(html, /CTO on duty/);
  assert.match(html, /width:33%/);
  assert.doesNotMatch(html, /<script/);
});

test('the CLI wakes the company through a symlinked directory', async () => {
  const { execFileSync } = await import('node:child_process');
  const { symlinkSync, readFileSync, cpSync } = await import('node:fs');
  const real = mkdtempSync(join(tmpdir(), 'panel-real-'));
  cpSync(new URL('..', import.meta.url).pathname, join(real, '.paperclip'), { recursive: true });
  const link = join(mkdtempSync(join(tmpdir(), 'panel-link-')), 'repo');
  symlinkSync(real, link);
  const out = execFileSync(join(link, '.paperclip', 'bin', 'panel'), ['--wake', '--no-color'], { cwd: link }).toString();
  assert.match(out, /CEO on duty/);
  assert.equal(JSON.parse(readFileSync(join(real, '.paperclip', 'state.json'), 'utf8')).role, 'ceo');
});

test('an older company: other column names, ### decisions, numbered oldest-first', async () => {
  const { rowView } = await import('./panel.mjs');
  const s = parseStatus(`## 1. 🔴 DECISIONS AWAITING THE FOUNDER
| # | Decision | Context | CEO recommendation |
|---|---|---|---|
| 1 | Pricing tier | launch week | ship $29 |

## 2. 🟡 IN FLIGHT
| Item | State | Gated on |
|---|---|---|
| Identity merge | building | legal review |

## F. 🧊 FROZEN
| # | Title |
|---|---|
| 1 | old idea |
`);
  assert.deepEqual(rowView(s.sections['1'].rows[0]), { title: 'Pricing tier', lens: '', state: '', rec: 'ship $29', why: 'launch week', plan: '' });
  assert.equal(rowView(s.sections['2'].rows[0]).title, 'Identity merge');
  assert.equal(rowView(s.sections['2'].rows[0]).state, 'building');
  assert.equal(s.sections.F, undefined, 'lettered sections are not panel sections');
  const d = parseDecisions('# Decision Log\n### 001 — World A → World B pivot\n**Date:** 2026-06-20\n\n### 002 — Men\'s health focus\n**Date:** 2026-06-21\n');
  assert.deepEqual(d, [{ n: '002', date: '2026-06-21', title: "Men's health focus" }, { n: '001', date: '2026-06-20', title: 'World A → World B pivot' }]);
});

test('a lived-in STATUS stays readable: resolved rows hidden, long rows clipped, long lists capped', async () => {
  const { isResolved, clip } = await import('./panel.mjs');
  const rows = [
    '| 1 | ~~Old call~~ **RESOLVED** | x | — |',
    ...Array.from({ length: 12 }, (_, i) => `| ${i + 2} | **Call ${i}** ${'very long context '.repeat(20)} | ctx | ${'a long recommendation '.repeat(10)} |`),
  ];
  const s = parseStatus(`## 1. Waiting\n| # | Decision | Context | Recommendation |\n|---|---|---|---|\n${rows.join('\n')}\n`);
  assert.equal(isResolved(s.sections['1'].rows[0]), true);
  const text = renderText({ name: 'x', lens: null, status: s, plans: [], decisions: [], roles: [], memory: { kind: 'none' }, git: {} }, { width: 100 });
  assert.match(text, /Waiting on you \(12 · 1 resolved, hidden\)/);
  assert.match(text, /\+4 more in STATUS\.md/);
  assert.ok(text.split('\n').every((l) => l.length <= 102), 'every line fits the width');
  assert.doesNotMatch(text, /\*\*/);
  assert.equal(clip('**a** `b` ~~c~~ d', 20), 'a b d');
});
