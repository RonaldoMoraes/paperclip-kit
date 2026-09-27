#!/usr/bin/env node
// The hidden acceptance check — never shown to an approach. Black-box: it builds the workspace's
// server, applies ITS migrations to a fresh database, signs two real users in with the dev
// email code, and drives the HTTP API that TASK.md pins. Knows nothing about file layout.
//
//   node bench/acceptance.mjs <workspace> <out.json>
import { spawn, execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WS = resolve(process.argv[2]);
const OUT = resolve(process.argv[3]);
const DB = `accept_${basename(dirname(WS))}`;
const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const ORIGIN = 'http://localhost:5173';
const env = { ...process.env, DATABASE_URL: `postgresql://postgres:postgres@localhost:5439/${DB}`, PORT: String(PORT), NODE_ENV: 'development' };

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: ok ? '' : String(detail).slice(0, 300) }); };
const sh = (cmd) => execSync(cmd, { cwd: WS, env, stdio: 'pipe', maxBuffer: 1 << 26 }).toString();

let server;
async function boot() {
  server = spawn('node', ['apps/server/dist/main.js'], { cwd: WS, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not come up:\n${log.slice(-2000)}`);
}
const stop = () => new Promise((r) => { if (!server || server.exitCode !== null) return r(); server.once('exit', r); server.kill('SIGTERM'); });

async function signIn(email) {
  const h = { 'content-type': 'application/json', origin: ORIGIN };
  await fetch(`${BASE}/api/auth/email-otp/send-verification-otp`, { method: 'POST', headers: h, body: JSON.stringify({ email, type: 'sign-in' }) });
  const r = await fetch(`${BASE}/api/auth/sign-in/email-otp`, { method: 'POST', headers: h, body: JSON.stringify({ email, otp: '12345' }) });
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  if (!r.ok || !cookie) throw new Error(`sign-in failed for ${email}: ${r.status}`);
  return cookie;
}

async function call(cookie, method, path, body) {
  const headers = { origin: ORIGIN, ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) };
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}

const car = (over = {}) => ({ brand: '  Volkswagen ', model: 'Gol 1.0', manufactureYear: 2020, modelYear: 2021, km: 45000, color: 'Prata', plate: 'abc-1d23', priceCents: 4990000, ...over });
const isIso = (s) => typeof s === 'string' && !Number.isNaN(Date.parse(s)) && /T/.test(s);

async function main() {
  // Setup — failures here mean the tree cannot even run the API, and every check fails.
  execSync(`bash "${join(HERE, 'db.sh')}" up && bash "${join(HERE, 'db.sh')}" recreate ${DB}`, { stdio: 'pipe' });
  sh('yarn db:generate');
  sh('yarn db:migrate:deploy');
  sh('yarn build:server');
  await boot();

  const A = await signIn('dealer-a@bench.test');
  const B = await signIn('dealer-b@bench.test');

  let r = await call(null, 'GET', '/api/vehicles');
  check('401 without a session', r.status === 401, r.status);

  r = await call(A, 'POST', '/api/vehicles', car());
  const v1 = r.json ?? {};
  check('create → 201', r.status === 201, `${r.status} ${r.text}`);
  check('create returns a string id', typeof v1.id === 'string' && v1.id.length > 0, r.text);
  check('plate normalised (abc-1d23 → ABC1D23)', v1.plate === 'ABC1D23', v1.plate);
  check('brand trimmed', v1.brand === 'Volkswagen', JSON.stringify(v1.brand));
  check('status defaults to available; timestamps ISO', v1.status === 'available' && isIso(v1.createdAt) && isIso(v1.updatedAt), r.text);

  await new Promise((res) => setTimeout(res, 20));
  r = await call(A, 'POST', '/api/vehicles', car({ plate: 'XYZ-9876', model: 'Polo', manufactureYear: 2022, modelYear: 2022 }));
  const v2 = r.json ?? {};
  check('old-format plate accepted → XYZ9876', r.status === 201 && v2.plate === 'XYZ9876', `${r.status} ${r.text}`);

  const bad = [
    ['missing brand', car({ brand: undefined, plate: 'BAD0001' })],
    ['blank brand', car({ brand: '   ', plate: 'BAD0002' })],
    ['modelYear = manufactureYear + 2', car({ modelYear: 2022, plate: 'BAD0003' })],
    ['invalid plate AB12345', car({ plate: 'AB12345' })],
    ['negative km', car({ km: -1, plate: 'BAD0004' })],
    ['priceCents 0', car({ priceCents: 0, plate: 'BAD0005' })],
    ['manufactureYear 1949', car({ manufactureYear: 1949, modelYear: 1949, plate: 'BAD0006' })],
    ['unknown status', car({ status: 'stolen', plate: 'BAD0007' })],
  ];
  let bad400 = 0; const badMiss = [];
  for (const [name, body] of bad) {
    const res = await call(A, 'POST', '/api/vehicles', body);
    if (res.status === 400) bad400++; else badMiss.push(`${name} → ${res.status}`);
  }
  check(`invalid bodies → 400 (${bad400}/${bad.length})`, bad400 === bad.length, badMiss.join('; '));

  r = await call(A, 'POST', '/api/vehicles', car({ plate: 'ABC1D23' }));
  check('duplicate plate for the same user → 409 CONFLICT', r.status === 409 && /CONFLICT/.test(r.text), `${r.status} ${r.text}`);

  r = await call(B, 'POST', '/api/vehicles', car({ plate: 'ABC-1D23' }));
  const vb = r.json ?? {};
  check('same plate for another user → 201', r.status === 201, `${r.status} ${r.text}`);

  r = await call(A, 'GET', '/api/vehicles');
  const listA = r.json?.vehicles ?? [];
  check('list → 200, own vehicles only', r.status === 200 && listA.length === 2 && listA.every((v) => v.id !== vb.id), `${r.status} ${r.text}`);
  check('list newest first', listA.length === 2 && v1.id && v2.id && listA[0].id === v2.id && listA[1].id === v1.id, listA.map((v) => v.id).join(','));

  const isoB = [await call(B, 'GET', `/api/vehicles/${v1.id}`), await call(B, 'PATCH', `/api/vehicles/${v1.id}`, { km: 1 }), await call(B, 'DELETE', `/api/vehicles/${v1.id}`)];
  // Only meaningful once A can read its own vehicle — a missing route also answers 404.
  const ownOk = v1.id && (await call(A, 'GET', `/api/vehicles/${v1.id}`)).status === 200;
  check("another user's vehicle → 404 on get/patch/delete", ownOk && isoB.every((x) => x.status === 404), isoB.map((x) => x.status).join(','));
  r = await call(A, 'GET', `/api/vehicles/${v1.id}`);
  check("A's vehicle untouched by B", r.status === 200 && r.json?.km === 45000, r.text);

  r = await call(A, 'PATCH', `/api/vehicles/${v1.id}`, { status: 'sold' });
  check('patch status → 200 sold, updatedAt moves', r.status === 200 && r.json?.status === 'sold' && Date.parse(r.json?.updatedAt) >= Date.parse(v1.updatedAt), `${r.status} ${r.text}`);
  r = await call(A, 'PATCH', `/api/vehicles/${v1.id}`, { modelYear: 2025 });
  check('patch breaking the year rule against stored values → 400', r.status === 400, `${r.status} ${r.text}`);
  r = await call(A, 'PATCH', `/api/vehicles/${v2.id}`, { plate: 'abc1d23' });
  check('patch to a plate the user already has → 409', r.status === 409, `${r.status} ${r.text}`);

  r = await call(A, 'GET', '/api/vehicles?status=sold');
  check('?status filter', r.status === 200 && r.json?.vehicles?.length === 1 && r.json.vehicles[0].id === v1.id, r.text);

  r = await call(A, 'GET', '/api/vehicles/does-not-exist');
  check('unknown id → 404', ownOk && r.status === 404, r.status);

  // Persistence: a restart must not lose anything (Postgres, not memory).
  await stop(); await boot();
  const A2 = await signIn('dealer-a@bench.test');
  r = await call(A2, 'GET', '/api/vehicles');
  check('survives a server restart', r.json?.vehicles?.length === 2, r.text);

  r = await call(A2, 'DELETE', `/api/vehicles/${v2.id}`);
  const after = await call(A2, 'GET', `/api/vehicles/${v2.id}`);
  const again = await call(A2, 'DELETE', `/api/vehicles/${v2.id}`);
  check('delete → 204, then 404', r.status === 204 && after.status === 404 && again.status === 404, `${r.status},${after.status},${again.status}`);
}

try {
  await main();
} catch (e) {
  check('setup / run', false, e.message);
} finally {
  await stop();
}
const TOTAL = 21; // every check above, so a run that dies midway still scores out of 21
const passed = results.filter((x) => x.ok).length;
writeFileSync(OUT, JSON.stringify({ passed, total: TOTAL, results }, null, 2));
console.log(`acceptance: ${passed}/${TOTAL}`);
for (const x of results) console.log(`${x.ok ? '✓' : '✗'} ${x.name}${x.ok ? '' : ` — ${x.detail}`}`);
