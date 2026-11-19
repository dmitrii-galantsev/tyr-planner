import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { loadSite } from './build.mjs';
import { createLoadouts, LIMITS, RateLimiter } from './loadouts.mjs';

const SITE_DIR = process.env.SITE_DIR || path.resolve(import.meta.dirname, '../dist');
const site = await loadSite(SITE_DIR);
const { sharing, core, idx } = site;

let dir;
let server;
let base;
let origin;
let clock = Date.parse('2026-11-19T12:00:00Z');
let ip = 1;

function legalBuild(vehicleId, extra = 0) {
  const sel = core.normalizeSelection(idx, { vehicleId });
  const nodes = core.getPlannerTalentsForVehicle(idx, vehicleId);
  const first = nodes.find((n) => n.tier === Math.min(...nodes.map((x) => x.tier)) && !n.prerequisiteIds.length);
  sel.talentPoints = { [first.talent.id]: 1 + (extra % first.maxPoints) };
  return sel;
}

async function start(dirPath) {
  server = http.createServer(async (req, res) => {
    const handled = await app.handle(req, res, new URL(req.url, 'http://x').pathname);
    if (!handled) res.writeHead(404).end();
  });
  let app;
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
  base = `${origin}/hq/`;
  app = createLoadouts({ site, dir: dirPath, publicBase: base, now: () => clock });
  return app;
}

async function call(pathName, { method = 'GET', body, cookie, headers = {}, from } = {}) {
  const res = await fetch(base + pathName, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      'X-Forwarded-For': from ?? `10.0.0.${ip}`,
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}

const sessionCookie = (res) => res.headers.get('set-cookie')?.split(';')[0];

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tyr-loadouts-test-'));
  await start(dir);
});

after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('empty list, then a guest post shows up newest first with a canonical code', async () => {
  ip++;
  assert.deepEqual((await call('api/loadouts')).json, { loadouts: [] });
  const sel = legalBuild('vanguard');
  const code = sharing.encodeShare(sel, 'ignored title');
  const res = await call('api/loadouts', { method: 'POST', body: { title: '  Brawl\u0000er\u202e  line ', author: 'Some Guest', code } });
  assert.equal(res.status, 201);
  const l = res.json.loadout;
  assert.deepEqual(Object.keys(l).sort(), ['author', 'code', 'createdAt', 'id', 'title', 'vehicleId', 'verified']);
  assert.equal(l.title, 'Brawler line');
  assert.equal(l.author, 'Some Guest');
  assert.equal(l.verified, false);
  assert.equal(l.vehicleId, 'vanguard');
  assert.equal(l.code, sharing.encodeShare(sel, 'Brawler line'));
  assert.equal(sharing.decodeShare(l.code).t, 'Brawler line');
  clock += 1000;
  const second = await call('api/loadouts', { method: 'POST', body: { title: '', author: '', code: sharing.encodeShare(legalBuild('ram'), '') } });
  assert.equal(second.status, 201);
  assert.equal(second.json.loadout.author, 'Anonymous');
  assert.match(second.json.loadout.title, /build$/);
  const list = (await call('api/loadouts')).json.loadouts;
  assert.deepEqual(list.map((x) => x.id), [second.json.loadout.id, l.id]);
  const dup = await call('api/loadouts', { method: 'POST', body: { title: 'Brawler line', author: 'x2', code } });
  assert.equal(dup.status, 409);
});

test('rejects bad codes, illegal builds, bad bodies and cross-origin posts', async () => {
  ip++;
  const post = (body, opts = {}) => call('api/loadouts', { method: 'POST', body, ...opts });
  assert.equal((await post({ title: 't', code: 'not a code' })).status, 400);
  assert.equal((await post({ title: 't', code: 'AAAAAAAAAAAAAAAA' })).status, 400);
  assert.equal((await post({ title: 5, code: sharing.encodeShare(legalBuild('ram'), '') })).status, 400);
  const sel = legalBuild('vanguard');
  const nodes = core.getPlannerTalentsForVehicle(idx, 'vanguard');
  const deep = nodes.find((n) => n.tier === Math.max(...nodes.map((x) => x.tier)));
  const locked = await post({ title: 'x', code: sharing.encodeShare({ ...sel, talentPoints: { [deep.talent.id]: 1 } }, '') });
  assert.equal(locked.status, 400);
  assert.match(locked.json.error, /not legal/);
  const tooMany = { ...sel, talentPoints: Object.fromEntries(nodes.slice(0, 20).map((n) => [n.talent.id, n.maxPoints])) };
  if (core.totalPoints(tooMany) > core.BUDGET) assert.equal((await post({ title: 'x', code: sharing.encodeShare(tooMany, '') })).status, 400);
  assert.equal((await post('{not json')).status, 400);
  assert.equal((await post('[1]')).status, 400);
  assert.equal((await post({ code: 'x'.repeat(LIMITS.body) })).status, 413);
  assert.equal((await call('api/loadouts', { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await post({ title: 'x', code: sharing.encodeShare(sel, '') }, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await post({ title: 'x', author: 'a', code: sharing.encodeShare(sel, '') })).status, 400);
  assert.equal((await post({ title: 'x', author: 'Admin', code: sharing.encodeShare(sel, '') })).status, 400);
  assert.equal((await call('api/loadouts', { method: 'DELETE' })).status, 405);
  assert.equal((await call('api/nope')).status, 404);
  const err = await post({ title: 't', code: 'bad' });
  assert.equal(typeof err.json.error, 'string');
  assert.equal(err.headers.get('cache-control'), 'no-store');
});

test('profiles: create, sign in elsewhere, signed posts, no guest impersonation, sign out', async () => {
  ip++;
  assert.deepEqual((await call('api/profile')).json, { profile: null });
  const created = await call('api/profile', { method: 'POST', body: { action: 'create', name: '  Tank  Ace ' } });
  assert.equal(created.status, 201);
  assert.deepEqual(created.json.profile, { name: 'Tank Ace' });
  assert.match(created.json.key, /^tyrk_[\w-]{43}$/);
  const setCookie = created.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Path=\/hq\//);
  const cookieA = sessionCookie(created);
  assert.deepEqual((await call('api/profile', { cookie: cookieA })).json, { profile: { name: 'Tank Ace' } });

  assert.equal((await call('api/profile', { method: 'POST', body: { action: 'create', name: 'tank_ace' } })).status, 409);

  const signed = await call('api/loadouts', { method: 'POST', cookie: cookieA, body: { title: 'Signed', author: 'Someone Else', code: sharing.encodeShare(legalBuild('ram', 1), '') } });
  assert.equal(signed.status, 201);
  assert.equal(signed.json.loadout.author, 'Tank Ace');
  assert.equal(signed.json.loadout.verified, true);

  const fake = await call('api/loadouts', { method: 'POST', body: { title: 'Fake', author: 'TANK-ACE', code: sharing.encodeShare(legalBuild('ram', 2), '') } });
  assert.equal(fake.status, 409);

  assert.equal((await call('api/profile', { method: 'POST', body: { action: 'login', key: 'tyrk_' + 'A'.repeat(43) } })).status, 401);
  assert.equal((await call('api/profile', { method: 'POST', body: { action: 'login', key: 42 } })).status, 401);
  const login = await call('api/profile', { method: 'POST', body: { action: 'login', key: created.json.key } });
  assert.equal(login.status, 200);
  assert.deepEqual(login.json, { profile: { name: 'Tank Ace' } });
  const cookieB = sessionCookie(login);
  assert.notEqual(cookieB, cookieA);

  const out = await call('api/profile', { method: 'POST', cookie: cookieB, body: { action: 'logout' } });
  assert.deepEqual(out.json, { profile: null });
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  assert.deepEqual((await call('api/profile', { cookie: cookieB })).json, { profile: null });
  assert.deepEqual((await call('api/profile', { cookie: cookieA })).json, { profile: { name: 'Tank Ace' } });
  assert.equal((await call('api/profile', { method: 'POST', body: { action: 'nope' } })).status, 400);

  const stored = fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8');
  assert.ok(!stored.includes(created.json.key));
  assert.ok(!stored.includes(cookieA.split('=')[1]));
  const pub = fs.readFileSync(path.join(dir, 'loadouts.json'), 'utf8');
  assert.ok(!pub.includes('10.0.0.'));
  assert.ok(!JSON.stringify((await call('api/loadouts')).json).includes('profileId'));
});

test('rate limits posts per client and answers 429 with Retry-After', async () => {
  ip++;
  const from = '10.9.9.9';
  let last;
  for (let i = 0; i < 6; i++) {
    last = await call('api/loadouts', { method: 'POST', from, body: { title: `Spam ${i}`, author: 'Spammer', code: sharing.encodeShare(legalBuild('drone', i), `s${i}`) } });
    if (i < 5) assert.equal(last.status, 201, JSON.stringify(last.json));
  }
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
  clock += 11 * 60e3;
  const later = await call('api/loadouts', { method: 'POST', from, body: { title: 'After wait', author: 'Spammer', code: sharing.encodeShare(legalBuild('drone', 3), 'later') } });
  assert.equal(later.status, 201);
  const limiter = new RateLimiter(() => 0, 2);
  limiter.take('a', '1', [[1, 1000]]);
  limiter.take('a', '2', [[1, 1000]]);
  limiter.take('a', '3', [[1, 1000]]);
  assert.equal(limiter.hits.size, 2);
});

test('state survives a restart, picks up a moderation edit and the list is bounded', async () => {
  ip++;
  const before = (await call('api/loadouts')).json.loadouts;
  server.close();
  await start(dir);
  assert.deepEqual((await call('api/loadouts')).json.loadouts, before);
  const victim = before[0].id;
  execFileSync(process.execPath, [path.join(import.meta.dirname, 'loadouts.mjs'), 'remove', victim], { env: { ...process.env, LOADOUTS_DIR: dir } });
  const listed = execFileSync(process.execPath, [path.join(import.meta.dirname, 'loadouts.mjs'), 'list'], { env: { ...process.env, LOADOUTS_DIR: dir }, encoding: 'utf8' });
  assert.ok(!listed.includes(victim));
  assert.ok(!(await call('api/loadouts')).json.loadouts.some((l) => l.id === victim));
  const file = path.join(dir, 'loadouts.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const template = data.loadouts[0];
  data.loadouts = Array.from({ length: LIMITS.stored }, (_, i) => ({ ...template, id: `x${i}`, code: `${template.code}${i}` }));
  fs.writeFileSync(file, JSON.stringify(data));
  const res = await call('api/loadouts', { method: 'POST', body: { title: 'Newest', author: 'Late', code: sharing.encodeShare(legalBuild('sonar'), '') } });
  assert.equal(res.status, 201);
  const list = (await call('api/loadouts')).json.loadouts;
  assert.equal(list.length, LIMITS.listed);
  assert.equal(list[0].title, 'Newest');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).loadouts.length, LIMITS.stored);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['accounts.json', 'loadouts.json']);
});

test('disabled without a state directory', async () => {
  const app = createLoadouts({ site, dir: null, publicBase: 'https://popi.tech/hq/' });
  const s = http.createServer((req, res) => app.handle(req, res, new URL(req.url, 'http://x').pathname));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const res = await fetch(`http://127.0.0.1:${s.address().port}/hq/api/loadouts`);
  assert.equal(res.status, 503);
  assert.ok((await res.json()).error);
  s.close();
});
