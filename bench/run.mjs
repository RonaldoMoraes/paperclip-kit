#!/usr/bin/env node
// Runs ONE approach through the three phases (plan → implement → verify) as three headless
// Claude Code turns in one session, and records wall time and tokens per phase.
//
//   node bench/run.mjs <approach> <workspace> <outdir> [--only plan|implement|verify]
//
// approach: paperclip | superpowers | raw
// Tokens: `result.modelUsage` is cumulative for the session (subagents included, carried over
// across --resume), so a phase's tokens are the difference between the last result before it
// and the last result at its end.
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, cpSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8'));
const PHASES = ['plan', 'implement', 'verify'];

const [approach, wsArg, outArg, ...rest] = process.argv.slice(2);
if (!CONFIG.approaches[approach] || !wsArg || !outArg) {
  console.error('usage: run.mjs <paperclip|superpowers|raw> <workspace> <outdir> [--only <phase>]');
  process.exit(1);
}
const only = rest[0] === '--only' ? rest[1] : null;
const WS = resolve(wsArg);
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });

const statePath = join(OUT, 'state.json');
const state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, 'utf8'))
  : { approach, workspace: WS, sessionId: randomUUID(), started: false, phases: {}, lastUsage: {} };
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${approach} ${msg}`;
  console.log(line);
  appendFileSync(join(OUT, 'runner.log'), line + '\n');
};

const read = (p) => readFileSync(join(HERE, p), 'utf8');
const fill = (s) => s.replaceAll('{{TASK}}', read(process.env.BENCH_TASK ?? 'TASK.md').trim());

function prompt(phase) {
  const a = CONFIG.approaches[approach];
  const parts = [];
  if (phase === 'plan') {
    parts.push(fill(read(a.opener ?? 'prompts/task-block.md')));
    parts.push(read('prompts/preamble.md'));
  }
  parts.push(read(`prompts/phase-${phase}.md`));
  return parts.join('\n\n');
}

function claudeArgs(text) {
  const a = CONFIG.approaches[approach];
  const args = ['-p', text, '--output-format', 'stream-json', '--verbose',
    '--model', process.env.BENCH_MODEL ?? CONFIG.model, '--permission-mode', 'bypassPermissions',
    '--setting-sources', 'project,local',
    '--strict-mcp-config', '--mcp-config', join(HERE, a.mcpConfig ?? CONFIG.mcpConfig),
    '--disallowedTools', ...CONFIG.disallowedTools];
  if (CONFIG.effort) args.push('--effort', CONFIG.effort);
  for (const p of a.pluginDirs ?? []) args.push('--plugin-dir', p.replace(/^~/, process.env.HOME));
  args.push(...(state.started ? ['--resume', state.sessionId] : ['--session-id', state.sessionId]));
  return args;
}

// One `claude -p` process. Resolves with what the phase accounting needs.
function turn(phase, text, idx) {
  return new Promise((done) => {
    const file = join(OUT, `${phase}.${idx}.jsonl`);
    writeFileSync(join(OUT, `${phase}.${idx}.prompt.md`), text);
    const approachEnv = Object.fromEntries(Object.entries(CONFIG.approaches[approach].env ?? {}).map(([k, v]) => [k, v.replace(/^~/, process.env.HOME)]));
    const child = spawn('claude', claudeArgs(text), { cwd: WS, env: { ...process.env, ...CONFIG.env, ...approachEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    state.started = true; save();
    let buf = '', lastResult = null, rejectedUntil = null, lastText = '';
    const timer = setTimeout(() => { log(`${phase} turn ${idx} hit the timeout — killing`); child.kill('SIGTERM'); },
      CONFIG.turnTimeoutMin * 60_000);
    child.stdout.on('data', (d) => {
      appendFileSync(file, d);
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        let ev; try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'result') { lastResult = ev; lastText = ev.result ?? lastText; }
        if (ev.type === 'rate_limit_event' && ev.rate_limit_info?.status === 'rejected') rejectedUntil = ev.rate_limit_info.resetsAt;
        if (ev.type === 'assistant' && !ev.parent_tool_use_id) {
          for (const c of ev.message?.content ?? []) if (c.type === 'tool_use') log(`${phase} · ${c.name}${c.input?.subagent_type ? ` (${c.input.subagent_type})` : ''}${c.input?.skill ? ` (${c.input.skill})` : ''}`);
        }
      }
    });
    child.stderr.on('data', (d) => appendFileSync(join(OUT, `${phase}.${idx}.stderr.txt`), d));
    child.on('close', (code) => { clearTimeout(timer); done({ code, lastResult, rejectedUntil, lastText }); });
  });
}

function usageDelta(now, before) {
  const out = {};
  for (const [model, u] of Object.entries(now ?? {})) {
    const b = before?.[model] ?? {};
    out[model] = {};
    for (const k of ['inputTokens', 'outputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens', 'costUSD']) {
      out[model][k] = (u[k] ?? 0) - (b[k] ?? 0);
    }
  }
  return out;
}

// Snapshot of the product change so far, without touching the workspace's index.
function snapshot(phase) {
  const idx = join(OUT, '.snapindex');
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  try {
    execFileSync('git', ['read-tree', CONFIG.baseCommit], { cwd: WS, env });
    execFileSync('git', ['add', '-A', '.'], { cwd: WS, env });
    const stat = execFileSync('git', ['diff', '--cached', '--stat', CONFIG.baseCommit], { cwd: WS, env, maxBuffer: 1 << 28 }).toString();
    const diff = execFileSync('git', ['diff', '--cached', CONFIG.baseCommit], { cwd: WS, env, maxBuffer: 1 << 28 }).toString();
    writeFileSync(join(OUT, `after-${phase}.diffstat.txt`), stat);
    writeFileSync(join(OUT, `after-${phase}.diff`), diff);
    const wt = execFileSync('git', ['worktree', 'list'], { cwd: WS }).toString();
    writeFileSync(join(OUT, `after-${phase}.worktrees.txt`), wt);
    // Planning documents that git never sees (the kit's ledger is git-excluded).
    for (const dir of CONFIG.planDocDirs) {
      if (existsSync(join(WS, dir))) cpSync(join(WS, dir), join(OUT, `after-${phase}.docs`, dir), { recursive: true });
    }
  } catch (e) { log(`snapshot failed: ${e.message}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runPhase(phase) {
  const marker = `PHASE-DONE: ${phase}`;
  const rec = { phase, turns: [], wallMs: 0, rateLimitWaitMs: 0, nudges: 0, completed: false };
  let text = prompt(phase);
  for (let i = 0; i <= CONFIG.maxNudges + CONFIG.maxRateLimitResumes; i++) {
    const t0 = Date.now();
    log(`${phase} turn ${i} start`);
    const r = await turn(phase, text, i);
    const ms = Date.now() - t0;
    rec.wallMs += ms;
    rec.turns.push({ idx: i, ms, exit: r.code, isError: r.lastResult?.is_error ?? null, numTurns: r.lastResult?.num_turns ?? null });
    if (r.lastResult?.modelUsage) {
      rec.usage = usageDelta(r.lastResult.modelUsage, state.lastUsagePhaseStart ?? state.lastUsage);
      rec.cumulativeUsage = r.lastResult.modelUsage;
    }
    log(`${phase} turn ${i} end · ${(ms / 60000).toFixed(1)} min · exit ${r.code}`);
    if (r.rejectedUntil || (r.lastResult?.is_error && /limit/i.test(r.lastText))) {
      const until = (r.rejectedUntil ?? Math.floor(Date.now() / 1000) + 3600) * 1000 + 60_000;
      const wait = Math.max(until - Date.now(), 60_000);
      log(`${phase} usage limit — waiting ${(wait / 60000).toFixed(0)} min (not counted)`);
      rec.rateLimitWaitMs += wait; save();
      await sleep(wait);
      text = read('prompts/resume-after-limit.md').replaceAll('{{PHASE}}', phase);
      continue;
    }
    if (r.lastText.includes(marker)) { rec.completed = true; rec.finalText = r.lastText; break; }
    if (rec.nudges >= CONFIG.maxNudges) { rec.finalText = r.lastText; log(`${phase} never printed ${marker} — giving up`); break; }
    rec.nudges++;
    text = read('prompts/nudge.md').replaceAll('{{PHASE}}', phase);
  }
  return rec;
}

for (const phase of PHASES) {
  if (only && phase !== only) continue;
  if (state.phases[phase]?.completed) { log(`${phase} already done — skipping`); continue; }
  state.lastUsagePhaseStart = state.lastUsage;
  const rec = await runPhase(phase);
  if (rec.cumulativeUsage) state.lastUsage = rec.cumulativeUsage;
  state.phases[phase] = rec;
  save();
  snapshot(phase);
  if (rec.finalText) writeFileSync(join(OUT, `${phase}.final.md`), rec.finalText);
  if (!rec.completed) { log(`stopping: ${phase} did not complete`); break; }
}
log('done');
