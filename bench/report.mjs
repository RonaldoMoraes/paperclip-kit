#!/usr/bin/env node
// Builds the comparison table from each run's state.json, gates.json and the judge's scores.
//   node bench/report.mjs  → writes <runsDir>/results.json and <runsDir>/REPORT.md
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8'));
const RUNS = CONFIG.runsDir.replace(/^~/, process.env.HOME);
const APPROACHES = Object.keys(CONFIG.approaches);
const PHASES = [['plan', 'plan'], ['implement', 'implementation'], ['verify', 'verification']];
const json = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

const judge = json(join(dirname(RUNS), 'judge', 'scores.json'));
const mapping = json(join(RUNS, 'judge-mapping.json')); // { X: 'raw', … }
const byApproach = mapping ? Object.fromEntries(Object.entries(mapping).map(([k, v]) => [v, judge?.[k]])) : {};
const own = json(join(RUNS, 'founder-scores.json')) ?? {}; // optional: { raw: { plan: 4, … } }

function sumUsage(usage = {}) {
  const t = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, byModel: {} };
  for (const [m, u] of Object.entries(usage)) {
    t.input += u.inputTokens; t.output += u.outputTokens;
    t.cacheRead += u.cacheReadInputTokens; t.cacheWrite += u.cacheCreationInputTokens; t.cost += u.costUSD;
    t.byModel[m] = u.inputTokens + u.outputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens;
  }
  t.total = t.input + t.output + t.cacheRead + t.cacheWrite;
  t.fresh = t.input + t.output + t.cacheWrite; // everything except cache reads
  return t;
}

const rows = [];
for (const a of APPROACHES) {
  const st = json(join(RUNS, a, 'out', 'state.json'));
  const gates = json(join(RUNS, a, 'out', 'gates.json'));
  for (const [key, label] of PHASES) {
    const p = st?.phases?.[key];
    const u = sumUsage(p?.usage);
    rows.push({
      approach: a, phase: label,
      minutes: p ? +(p.wallMs / 60000).toFixed(1) : null,
      completed: p?.completed ?? false, nudges: p?.nudges ?? null,
      rateLimitWaitMin: p ? +(p.rateLimitWaitMs / 60000).toFixed(0) : null,
      tokens: u, judge: byApproach[a]?.[label] ?? null, founder: own[a]?.[label] ?? null,
    });
  }
  rows.push({ approach: a, phase: 'TOTAL', gates });
}
writeFileSync(join(RUNS, 'results.json'), JSON.stringify({ rows, judge, mapping }, null, 2));

const k = (n) => (n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1e3)}k`);
const lines = [
  '| Approach | Phase | Time (min) | Tokens, fresh¹ | Tokens, cache reads | Cost² | Quality, judge (1–5) | Quality, Founder (1–5) |',
  '|---|---|---:|---:|---:|---:|---:|---:|',
];
for (const a of APPROACHES) {
  const mine = rows.filter((r) => r.approach === a && r.phase !== 'TOTAL');
  for (const r of mine) {
    lines.push(`| ${a} | ${r.phase}${r.completed ? '' : ' ⚠︎'} | ${r.minutes ?? '—'} | ${k(r.tokens.fresh)} | ${k(r.tokens.cacheRead)} | $${r.tokens.cost.toFixed(2)} | ${r.judge?.score ?? '—'} | ${r.founder ?? '—'} |`);
  }
  const tot = mine.reduce((s, r) => ({ m: s.m + (r.minutes ?? 0), f: s.f + r.tokens.fresh, c: s.c + r.tokens.cacheRead, $: s.$ + r.tokens.cost }), { m: 0, f: 0, c: 0, $: 0 });
  lines.push(`| **${a}** | **total** | **${tot.m.toFixed(1)}** | **${k(tot.f)}** | **${k(tot.c)}** | **$${tot.$.toFixed(2)}** | | |`);
}
lines.push('', '¹ input + output + cache writes, subagents included · ² list-price equivalent, as Claude Code reports it; on a subscription this is usage, not a bill · ⚠︎ phase did not finish');
writeFileSync(join(RUNS, 'REPORT.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
