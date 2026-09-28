#!/usr/bin/env node
// After an upgrade (install.sh --replace-company), carry what the Founder wrote themselves into 1.0:
//   - custom CLAUDE.local.md sections   → the new CLAUDE.local.md, "Carried over" section
//   - PLAYBOOK.md rules still true      → COMPANY.md §6 "House rules"
//   - roles hired into .claude/agents   → lens cards in .paperclip/roles/
// "Custom" means: not a line of any template the kit ever shipped (legacy/<version>/ + template/).
// Idempotent: each target carries a marker and is written once. Everything lands for review.
//
//   node bin/lib/carry-over.mjs <repo> <backup-dir>
import { readFileSync, writeFileSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const norm = (l) => l.trim().replace(/\s+/g, ' ');

/** Lines of every shipped version of <name>: each legacy/<version>/<name>, and the current template. */
export function knownLines(name, currentTemplate) {
  const set = new Set();
  const dirs = existsSync(join(KIT, 'legacy')) ? readdirSync(join(KIT, 'legacy')) : [];
  for (const d of dirs) for (const l of (read(join(KIT, 'legacy', d, name)) ?? '').split('\n')) set.add(norm(l));
  for (const l of (read(currentTemplate) ?? '').split('\n')) set.add(norm(l));
  return set;
}

/** Runs of lines the kit never shipped. Blank lines join a run, a heading starts a new one, and tiny
 *  runs (a path fix) are dropped. */
export function customBlocks(text, known, { drop = () => false, minChars = 60 } = {}) {
  const blocks = [];
  let cur = [];
  const flush = () => {
    while (cur.length && !cur[cur.length - 1].trim()) cur.pop();
    if (cur.join('').replace(/\s/g, '').length >= minChars) blocks.push(cur.join('\n'));
    cur = [];
  };
  for (const line of text.split('\n')) {
    const n = norm(line);
    if (!n) { if (cur.length) cur.push(''); continue; }
    if (known.has(n) || drop(line)) { flush(); continue; }
    if (/^#{1,6} /.test(line.trim())) flush(); // a heading starts its own block
    cur.push(line);
  }
  flush();
  return blocks;
}

// Headings move two levels down, so a carried "# Title" can't compete with the file's own.
const demote = (s) => s.replace(/^(#{1,4}) /gm, (_, h) => `${h}## `);

// PLAYBOOK lines about the retired machinery (harness, ledger, executor roles) and role tables.
const RETIRED = /HARNESS|tech[- ]lead|critic|\bengineer\b|\bpc\b|`pc|ledger|campaign|mini-order|work order|slice|checkpoint|\/build|\/task|\/findings|\/brief|briefs\/|^\s*\|/i;

export function carryOver(repo, backup) {
  const done = [];
  // 1. CLAUDE.local.md
  const oldLocal = read(join(backup, 'CLAUDE.local.md'));
  const localPath = join(repo, 'CLAUDE.local.md');
  const local = read(localPath);
  if (oldLocal && local && !local.includes('<!-- paperclip:carried-over -->')) {
    const blocks = customBlocks(oldLocal, knownLines('CLAUDE.local.md', join(KIT, 'template', 'CLAUDE.local.md')));
    if (blocks.length) {
      const section = `## Carried over from your previous CLAUDE.local.md\n<!-- paperclip:carried-over -->\n> Moved here by the 1.0 upgrade. Keep what's still true, delete the rest.\n\n${blocks.map(demote).join('\n\n')}\n\n`;
      const anchor = '## When Paperclip is OFF';
      writeFileSync(localPath, local.includes(anchor) ? local.replace(anchor, section + anchor) : `${local.trimEnd()}\n\n${section}`);
      done.push(`CLAUDE.local.md: ${blocks.length} section(s) of yours carried over`);
    }
  }
  // 2. PLAYBOOK.md → COMPANY.md §6
  const oldPlay = read(join(backup, '.paperclip', 'PLAYBOOK.md'));
  const companyPath = join(repo, '.paperclip', 'COMPANY.md');
  let company = read(companyPath);
  if (oldPlay && company && !company.includes('<!-- paperclip:house-rules -->')) {
    const known = knownLines('PLAYBOOK.md', null);
    const blocks = customBlocks(oldPlay, known, { drop: (l) => RETIRED.test(l), minChars: 40 });
    if (blocks.length) {
      company = `${company.trimEnd()}\n\n## 6. House rules (carried over from PLAYBOOK.md)\n<!-- paperclip:house-rules -->\n> Your own rules from the old playbook; the parts about the retired build harness were left out. Keep what's still true.\n\n${blocks.map(demote).join('\n\n')}\n`;
      writeFileSync(companyPath, company);
      done.push(`COMPANY.md: ${blocks.length} house rule block(s) carried over from PLAYBOOK.md`);
    }
  }
  // 3. Hired roles (company-layer agents: real files, git-excluded) → lens cards
  const agentsDir = join(repo, '.claude', 'agents');
  const exclude = read(join(repo, '.git', 'info', 'exclude')) ?? '';
  const hired = [];
  if (existsSync(agentsDir) && company) {
    for (const f of readdirSync(agentsDir).filter((x) => x.endsWith('.md'))) {
      const slug = basename(f, '.md');
      const card = join(repo, '.paperclip', 'roles', f);
      if (slug === 'researcher' || existsSync(card) || lstatSync(join(agentsDir, f)).isSymbolicLink()) continue;
      if (!exclude.split('\n').includes(`/.claude/agents/${f}`)) continue; // tracked: the product's own agent
      const fm = (read(join(agentsDir, f)).match(/^---\n([\s\S]*?)\n---/) ?? [, ''])[1];
      const get = (k) => fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? '';
      const name = slug.split('-').map((w) => (w.length <= 4 && /^[a-z]+$/.test(w) && ['ceo', 'cto', 'cmo', 'crgo', 'ux', 'ui'].includes(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ');
      const lane = get('description').split(/\.\s+Use\b/)[0] || name;
      writeFileSync(card, `---\nname: ${name}\nlane: ${lane}\ncolor: ${get('color') || 'gray'}\n---\nThink like the \`${slug}\` specialist (\`.claude/agents/${f}\` has the full brief). As a lens, reason and decide within this lane in the main conversation; spawn the agent only for parallel or heavy work.\n`);
      hired.push({ name, lane, slug });
    }
    if (hired.length) {
      const rows = hired.map((h) => `| **${h.name}** | ${h.lane} | \`roles/${h.slug}.md\`, and an agent for parallel work |`).join('\n');
      const anchor = /(\| \*\*Researcher\*\* \|[^\n]*\n)/;
      company = read(companyPath);
      writeFileSync(companyPath, anchor.test(company) ? company.replace(anchor, `$1${rows}\n`) : company);
      done.push(`roles: ${hired.map((h) => h.name).join(', ')} became lenses (their agents stay)`);
    }
  }
  return done;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [repo, backup] = process.argv.slice(2);
  if (!repo || !backup) { console.error('usage: carry-over.mjs <repo> <backup-dir>'); process.exit(1); }
  const done = carryOver(repo, backup);
  for (const d of done) console.log(`  ✓ ${d}`);
  if (!done.length) console.log('  (nothing of yours to carry over)');
}
