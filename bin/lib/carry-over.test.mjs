// node --test bin/lib/carry-over.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { customBlocks, carryOver } from './carry-over.mjs';

test('customBlocks keeps only what the kit never shipped, dropping tiny edits and retired lines', () => {
  const known = new Set(['# Paperclip', 'Stock line one.', 'Stock line two.']);
  const text = '# Paperclip\nStock line one.\nfixed path\n\n# About Acme\nAcme sells pet food to vets across Brazil.\n\nIt ships weekly.\nStock line two.\nThe ledger rules here.';
  const blocks = customBlocks(text, known, { drop: (l) => /ledger/.test(l), minChars: 20 });
  assert.equal(blocks.length, 1);
  assert.match(blocks[0], /^# About Acme\nAcme sells pet food/);
  assert.match(blocks[0], /It ships weekly\.$/);
});

test('carryOver moves your sections, house rules and hired roles in once', () => {
  const repo = mkdtempSync(join(tmpdir(), 'carry-'));
  const backup = join(repo, '.paperclip', '.backup-x');
  mkdirSync(join(backup, '.paperclip'), { recursive: true });
  mkdirSync(join(repo, '.paperclip', 'roles'), { recursive: true });
  mkdirSync(join(repo, '.claude', 'agents'), { recursive: true });
  mkdirSync(join(repo, '.git', 'info'), { recursive: true });
  writeFileSync(join(backup, 'CLAUDE.local.md'), '# Paperclip — AI Company (personal, local-only)\n\n# About Acme\nAcme sells pet food to veterinary clinics across Brazil, B2B only.\n');
  writeFileSync(join(backup, '.paperclip', 'PLAYBOOK.md'), '# Paperclip Playbook — Operating Model\n- Every price change needs the CFO lens and a margin check first.\n- The critic attacks every plan.\n');
  writeFileSync(join(repo, 'CLAUDE.local.md'), '# Paperclip\n\n## When Paperclip is OFF\nIgnore.\n');
  writeFileSync(join(repo, '.paperclip', 'COMPANY.md'), '# Company\n| **Researcher** | research | agent |\n');
  writeFileSync(join(repo, '.claude', 'agents', 'data-analyst.md'), '---\nname: data-analyst\ndescription: SQL and dashboards. Use for numbers.\ncolor: cyan\n---\nbody\n');
  writeFileSync(join(repo, '.claude', 'agents', 'playwright-helper.md'), '---\nname: x\n---\n');
  writeFileSync(join(repo, '.git', 'info', 'exclude'), '/.claude/agents/data-analyst.md\n');
  const done = carryOver(repo, backup);
  assert.equal(done.length, 3);
  const local = readFileSync(join(repo, 'CLAUDE.local.md'), 'utf8');
  assert.match(local, /### About Acme\nAcme sells pet food/);
  assert.ok(local.indexOf('Carried over') < local.indexOf('## When Paperclip is OFF'));
  const company = readFileSync(join(repo, '.paperclip', 'COMPANY.md'), 'utf8');
  assert.match(company, /House rules[\s\S]*margin check/);
  assert.doesNotMatch(company, /critic attacks/);
  assert.match(company, /\| \*\*Data Analyst\*\* \| SQL and dashboards \|/);
  assert.match(readFileSync(join(repo, '.paperclip', 'roles', 'data-analyst.md'), 'utf8'), /name: Data Analyst\nlane: SQL and dashboards\ncolor: cyan/);
  assert.deepEqual(carryOver(repo, backup), [], 'a second run carries nothing twice');
});
