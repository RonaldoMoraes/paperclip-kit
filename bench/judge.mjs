#!/usr/bin/env node
// Blind quality grading, after all three approaches have been evaluated. Assembles
// <runsDir>/judge/{X,Y,Z,base}/ under a random label mapping, scrubs the words that name a
// process, and asks one fresh Claude session to grade all three side by side.
//   node bench/judge.mjs
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8'));
const RUNS = CONFIG.runsDir.replace(/^~/, process.env.HOME);
// A queued run can hold the judge until the last approach is in: `touch <runsDir>/judge.hold`.
if (existsSync(join(RUNS, 'judge.hold')) && !process.env.BENCH_JUDGE_FORCE) {
  console.log('judge on hold (runs/judge.hold) — skipping');
  process.exit(0);
}
const J = join(dirname(RUNS), 'judge'); // outside the runs dir, so no folder names a process
// Only approaches whose run was evaluated; the judge grades them all side by side in one session.
const approaches = Object.keys(CONFIG.approaches).filter((a) => existsSync(join(RUNS, a, 'out', 'acceptance.json')));
const txt = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

// Words that would tell the judge which process produced an attempt.
const SCRUB = [
  [/paperclip[- ]?kit|paperclip/gi, 'the kit'], [/superpowers?:?[\w-]*/gi, '[workflow]'],
  [/\bFounder\b/g, 'the user'], [/\btech-lead\b/gi, 'planner'], [/\bcritic\b/gi, 'reviewer'],
  [/\b(CTO|CEO|CRGO|CMO)\b/g, 'lead'], [/\.paperclip\//g, '.notes/'], [/\bpc (task|campaign|finding|estimate|handoff)\b[^\n]*/g, '[bookkeeping]'],
  [/\b(brainstorming|writing-plans|executing-plans|subagent-driven-development|test-driven-development|verification-before-completion|requesting-code-review|finishing-a-development-branch)\b/gi, '[step]'],
  [/ai-memory[\w-]*/gi, '[memory tool]'], [/\becc:[\w-]+/gi, '[step]'], [/\bECC\b/g, 'the kit'], [/homunculus|instincts?/gi, '[memory]'], [/\bmemory_[a-z_]+\b/g, '[memory tool]'],
  [/^PHASE-DONE: \w+\s*$/gm, ''],
];
const scrub = (s) => SCRUB.reduce((acc, [re, to]) => acc.replace(re, to), s);

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
}

// Drop the hunks of files that are planning notes rather than product change.
function productDiff(diff) {
  return diff.split(/^(?=diff --git )/m)
    .filter((h) => !CONFIG.judgeExcludeFromChange.some((p) => h.startsWith(`diff --git a/${p}`)))
    .join('');
}

rmSync(J, { recursive: true, force: true });
mkdirSync(join(J, 'base'), { recursive: true });
execSync(`git -C "${CONFIG.fixtureRepo.replace(/^~/, process.env.HOME)}" archive ${CONFIG.baseCommit} | tar -x -C "${join(J, 'base')}"`);

const labels = ['U', 'V', 'W', 'X', 'Y', 'Z'].slice(-approaches.length);
const order = [...approaches];
for (let i = order.length - 1; i > 0; i--) { const k = randomInt(i + 1); [order[i], order[k]] = [order[k], order[i]]; }
const mapping = Object.fromEntries(labels.map((l, i) => [l, order[i]]));

for (const [label, a] of Object.entries(mapping)) {
  const out = join(RUNS, a, 'out');
  const dir = join(J, label);
  mkdirSync(dir, { recursive: true });
  const docsRoot = join(out, 'after-plan.docs');
  const docs = walk(docsRoot).map((p) => `\n\n---\n## ${scrub(relative(docsRoot, p))}\n\n${txt(p)}`).join('');
  const planDiff = txt(join(out, 'after-plan.diff'));
  writeFileSync(join(dir, 'plan.md'), scrub(`# Closing message of the plan phase\n\n${txt(join(out, 'plan.final.md'))}\n\n# Planning documents${docs || ' — none outside the diff'}\n\n# Files written during the plan phase (diff)\n\n\`\`\`diff\n${planDiff}\n\`\`\`\n`));
  writeFileSync(join(dir, 'change.diff'), scrub(productDiff(txt(join(out, 'after-verify.diff')))));
  writeFileSync(join(dir, 'verify-report.md'), scrub(txt(join(out, 'verify.final.md'))));
  writeFileSync(join(dir, 'gates.txt'), scrub(txt(join(out, 'gates.txt'))));
}
writeFileSync(join(RUNS, 'judge-mapping.json'), JSON.stringify(mapping, null, 2)); // never inside J

const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
const prompt = readFileSync(join(HERE, 'prompts/judge.md'), 'utf8')
  .replaceAll('{{TASK}}', readFileSync(join(HERE, 'TASK.md'), 'utf8').trim())
  .replaceAll('{{N}}', words[labels.length])
  .replaceAll('{{LABELS}}', labels.map((l) => `**${l}**`).join(', '))
  .replaceAll('{{DIRS}}', labels.join('|'));
const raw = execFileSync('claude', ['-p', prompt, '--output-format', 'json', '--model', CONFIG.judgeModel ?? CONFIG.model,
  '--permission-mode', 'bypassPermissions', '--setting-sources', 'project', '--strict-mcp-config',
  '--tools', 'Read,Grep,Glob', '--no-session-persistence'], { cwd: J, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const result = JSON.parse(raw).result;
writeFileSync(join(J, 'judge-raw.md'), result);
const m = result.match(/\{[\s\S]*\}/);
if (!m) { console.error('✗ judge did not return JSON — see judge/judge-raw.md'); process.exit(1); }
writeFileSync(join(J, 'scores.json'), JSON.stringify(JSON.parse(m[0]), null, 2));
console.log(`✓ judged — mapping ${JSON.stringify(mapping)} · scores in ${join(J, 'scores.json')}`);
