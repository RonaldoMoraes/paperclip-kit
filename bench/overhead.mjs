#!/usr/bin/env node
// Where an approach's time and tokens go, by what each API call was for — read-only, from the
// session transcripts (main thread + every subagent), safe to run while a benchmark is live.
//
//   node bench/overhead.mjs <approach> [--json]
//
// Attribution: every API call (one assistant message) is charged in full to the categories of
// the tool calls it made (split evenly when it made several). Its time is the whole cycle: from
// the entry before it (the prompt or the previous tool results) to the tool results that answer
// it. Waiting on a subagent is not counted on the caller's side — the subagent's own transcript
// carries that time. Cost is apportioned from Claude Code's per-model totals by weighted tokens
// (input 1 · 1h cache write 2 · 5m cache write 1.25 · cache read 0.1 · output 5), so it is an
// estimate; token counts are exact.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8'));
const RUNS = CONFIG.runsDir.replace(/^~/, process.env.HOME);
const approach = process.argv[2];
const asJson = process.argv.includes('--json');
const state = JSON.parse(readFileSync(join(RUNS, approach, 'out', 'state.json'), 'utf8'));
const WS = join(RUNS, approach, 'ws');
const projDir = join(process.env.HOME, '.claude', 'projects', WS.replace(/[^A-Za-z0-9]/g, '-'));
const sessionFile = join(projDir, `${state.sessionId}.jsonl`);
const subDir = join(projDir, state.sessionId, 'subagents');

// First match wins. "ledger" is memory management proper: the work ledger and the status files.
const CATEGORIES = [
  ['ledger', (s) => /(^|[\s;&|(=/])pc\s+(task|campaign|finding|handoff|estimate|notify|scope)\b|\.paperclip\/bin\/pc|\.paperclip\/(work|campaigns|findings|log|contracts)\/|\.paperclip\/(STATUS|decisions|STORY)\.md|orders\/[^\s]*\.snapshots/.test(s)],
  ['process-manual', (s) => /\.paperclip\/(PLAYBOOK|HARNESS)\.md|\.paperclip\/briefs\/|orders\/README\.md|CLAUDE\.local\.md|\.claude\/(commands|agents)\/|\.agents\/(commands|skills)\/|skills\/[\w-]+\/SKILL\.md/.test(s)],
  ['agent-output-recovery', (s) => /\.claude\/projects\/|\/tasks\/[\w-]+\.output/.test(s)],
  ['plan-documents', (s) => /\.paperclip\/(orders|research)\/|docs\/superpowers\/|docs\/plans\//.test(s)],
];
const TOOL_CATEGORY = { TaskCreate: 'ledger', TaskUpdate: 'ledger', TaskList: 'ledger', TaskGet: 'ledger', TodoWrite: 'ledger', Agent: 'delegation', Task: 'delegation', SendMessage: 'delegation', Skill: 'process-manual' };

function categorize(tu) {
  if (TOOL_CATEGORY[tu.name]) return TOOL_CATEGORY[tu.name];
  if (tu.name.startsWith('mcp__ai-memory')) return 'ledger'; // ai-memory's own MCP tools are memory management too
  const s = JSON.stringify(tu.input ?? {});
  for (const [name, test] of CATEGORIES) if (test(s)) return name;
  return 'product-work';
}

const readLines = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

const phaseBounds = [];
{
  const log = readFileSync(join(RUNS, approach, 'out', 'runner.log'), 'utf8');
  for (const m of log.matchAll(/^\[(.+?)\] \S+ (plan|implement|verify) turn 0 start/gm)) phaseBounds.push([m[2], Date.parse(m[1])]);
}
const phaseOf = (t) => { let p = phaseBounds[0]?.[0] ?? 'plan'; for (const [name, start] of phaseBounds) if (t >= start) p = name; return p; };

const W = { in: 1, cw1h: 2, cw5m: 1.25, cr: 0.1, out: 5 };
const agg = {}; // key: phase|agent|category → totals
const add = (k, v) => {
  const a = (agg[k] ??= { calls: 0, ms: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, weighted: 0, byModel: {} });
  for (const f of ['calls', 'ms', 'input', 'cacheWrite', 'cacheRead', 'output', 'weighted']) a[f] += v[f];
  a.byModel[v.model] = (a.byModel[v.model] ?? 0) + v.weighted;
};

function analyze(file, agent) {
  const lines = readLines(file);
  const msgs = new Map(); // message.id → { first, last, usage, model, toolUses: [] }
  const toolResultAt = new Map(); // tool_use_id → ts
  let prevTs = null;
  const order = [];
  for (const e of lines) {
    const ts = Date.parse(e.timestamp);
    if (e.type === 'user') {
      for (const c of Array.isArray(e.message?.content) ? e.message.content : []) if (c.type === 'tool_result') toolResultAt.set(c.tool_use_id, ts);
      prevTs = ts;
    } else if (e.type === 'assistant' && e.message?.id) {
      let m = msgs.get(e.message.id);
      if (!m) { m = { start: prevTs ?? ts, last: ts, usage: e.message.usage, model: e.message.model, toolUses: [] }; msgs.set(e.message.id, m); order.push(m); }
      m.last = ts; m.usage = e.message.usage ?? m.usage;
      for (const c of e.message.content ?? []) if (c.type === 'tool_use') m.toolUses.push(c);
    }
  }
  for (const m of order) {
    if (!m.usage || m.model === '<synthetic>') continue;
    const u = m.usage;
    const cw1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const cw5m = (u.cache_creation_input_tokens ?? 0) - cw1h;
    const weighted = u.input_tokens * W.in + cw1h * W.cw1h + cw5m * W.cw5m + u.cache_read_input_tokens * W.cr + u.output_tokens * W.out;
    const cats = m.toolUses.length ? m.toolUses.map(categorize) : ['reply/coordination'];
    // Cycle time: model generation, plus tool execution unless the tool was a subagent (its own transcript counts it).
    const execEnd = Math.max(m.last, ...m.toolUses.filter((t) => categorize(t) !== 'delegation').map((t) => toolResultAt.get(t.id) ?? m.last));
    const ms = Math.max(0, execEnd - m.start);
    const share = 1 / cats.length;
    for (const c of cats) {
      add(`${phaseOf(m.start)}|${agent}|${c}`, {
        calls: share, ms: ms * share, input: u.input_tokens * share, cacheWrite: (u.cache_creation_input_tokens ?? 0) * share,
        cacheRead: u.cache_read_input_tokens * share, output: u.output_tokens * share, weighted: weighted * share, model: m.model,
      });
    }
  }
}

analyze(sessionFile, 'orchestrator');
if (existsSync(subDir)) {
  for (const f of readdirSync(subDir).filter((x) => x.endsWith('.jsonl'))) {
    const meta = existsSync(join(subDir, f.replace('.jsonl', '.meta.json'))) ? JSON.parse(readFileSync(join(subDir, f.replace('.jsonl', '.meta.json')), 'utf8')) : {};
    analyze(join(subDir, f), meta.agentType ?? 'subagent');
  }
}

// Cost: calibrate $/weighted-token per model on the finished phases (Claude Code reports cost only
// when a phase's turn ends), then price every call — the live phase included — at that rate.
const done = Object.entries(state.phases).filter(([, p]) => p.cumulativeUsage);
const lastCum = done.length ? done[done.length - 1][1].cumulativeUsage : {};
const donePhases = new Set(done.map(([name]) => name));
const weightByModel = {};
for (const [key, a] of Object.entries(agg)) {
  if (!donePhases.has(key.split('|')[0])) continue;
  for (const [m, w] of Object.entries(a.byModel)) weightByModel[m] = (weightByModel[m] ?? 0) + w;
}
const usdPerWeight = Object.fromEntries(Object.keys(weightByModel).map((m) => {
  const key = Object.keys(lastCum).find((k) => k.startsWith(m) || m.startsWith(k.replace(/-\d{8}$/, '')));
  return [m, key ? lastCum[key].costUSD / weightByModel[m] : 0];
}));
const costOf = (a) => Object.entries(a.byModel).reduce((s, [m, w]) => s + w * (usdPerWeight[m] ?? 0), 0);

// Roll-ups.
const roll = (keyFn) => {
  const out = {};
  for (const [k, a] of Object.entries(agg)) {
    const [phase, agent, cat] = k.split('|');
    const key = keyFn({ phase, agent, cat });
    if (key == null) continue;
    const o = (out[key] ??= { calls: 0, min: 0, fresh: 0, cacheRead: 0, usd: 0 });
    o.calls += a.calls; o.min += a.ms / 60000; o.fresh += a.input + a.cacheWrite + a.output; o.cacheRead += a.cacheRead; o.usd += costOf(a);
  }
  return out;
};
const byCat = roll(({ cat }) => cat);
const byPhaseCat = roll(({ phase, cat }) => `${phase}|${cat}`);
const byAgentLedger = roll(({ agent, cat }) => (cat === 'ledger' ? agent : null));
const total = Object.values(byCat).reduce((s, o) => ({ calls: s.calls + o.calls, min: s.min + o.min, fresh: s.fresh + o.fresh, cacheRead: s.cacheRead + o.cacheRead, usd: s.usd + o.usd }), { calls: 0, min: 0, fresh: 0, cacheRead: 0, usd: 0 });

if (asJson) { console.log(JSON.stringify({ byCat, byPhaseCat, byAgentLedger, total }, null, 2)); process.exit(0); }

const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1e3)}k`);
const pct = (a, b) => `${((100 * a) / (b || 1)).toFixed(1)}%`;
const table = (rows, first) => {
  console.log(`| ${first} | API calls | agent-min | % time | fresh tokens | cache reads | ~cost | % cost |`);
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const [name, o] of rows) console.log(`| ${name} | ${Math.round(o.calls)} | ${o.min.toFixed(1)} | ${pct(o.min, total.min)} | ${k(o.fresh)} | ${k(o.cacheRead)} | $${o.usd.toFixed(2)} | ${pct(o.usd, total.usd)} |`);
};
console.log(`## ${approach} — by purpose (all phases so far)\n`);
table(Object.entries(byCat).sort((a, b) => b[1].usd - a[1].usd), 'category');
console.log(`| **total** | ${Math.round(total.calls)} | ${total.min.toFixed(1)} | | ${k(total.fresh)} | ${k(total.cacheRead)} | $${total.usd.toFixed(2)} | |`);
const byPhase = roll(({ phase }) => phase);
console.log(`\n_agent-minutes by phase (time some agent was generating or running a tool): ${Object.entries(byPhase).map(([p, o]) => `${p} ${o.min.toFixed(0)}`).join(' · ')} — models priced: ${Object.keys(usdPerWeight).join(', ')}_`);
console.log(`\n## ${approach} — ledger (memory management) by phase\n`);
table(Object.entries(byPhaseCat).filter(([key]) => key.endsWith('|ledger')).map(([key, o]) => [key.split('|')[0], o]), 'phase');
console.log(`\n## ${approach} — ledger by who spends it\n`);
table(Object.entries(byAgentLedger).sort((a, b) => b[1].usd - a[1].usd), 'agent');
