import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const LIMITS = {
  body: 4096,
  title: 48,
  name: 24,
  stored: 2000,
  listed: 100,
  profiles: 20000,
  sessionsPerProfile: 10,
  sessionDays: 180,
};

const RATES = {
  post: [[5, 10 * 60e3], [30, 24 * 3600e3]],
  postGlobal: [[120, 3600e3]],
  create: [[3, 3600e3], [10, 24 * 3600e3]],
  createGlobal: [[60, 3600e3]],
  login: [[10, 10 * 60e3]],
};

const COOKIE = 'tyrhq_session';
const KEY_RE = /^tyrk_[A-Za-z0-9_-]{43}$/;
const CODE_RE = /^[\w-]{11,400}$/;
const NAME_RE = /^[\p{L}\p{N}](?:[\p{L}\p{N} _.'-]*[\p{L}\p{N}_.])?$/u;
const RESERVED = new Set(['anonymous', 'guest', 'admin', 'administrator', 'moderator', 'mod', 'tyrhq', 'tyr hq', 'stoke', 'stoke games', 'official', 'system']);

class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

export function stateDirFromEnv(env = process.env) {
  return env.STATE_DIRECTORY?.split(':')[0] || env.LOADOUTS_DIR || null;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomId = (bytes) => crypto.randomBytes(bytes).toString('base64url');

export function cleanText(value, max) {
  const s = String(value ?? '')
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return Array.from(s).slice(0, max).join('').trim();
}

export const foldName = (name) => cleanText(name, 64).normalize('NFKC').toLowerCase().replace(/[\s_.'-]+/g, ' ').trim();

function validName(raw, what) {
  if (typeof raw !== 'string') throw new HttpError(400, `${what} must be a string`);
  const name = cleanText(raw, LIMITS.name + 1);
  if (Array.from(name).length > LIMITS.name) throw new HttpError(400, `${what} is longer than ${LIMITS.name} characters`);
  if (Array.from(name).length < 2 || !NAME_RE.test(name)) throw new HttpError(400, `${what} must be 2 to ${LIMITS.name} letters, numbers, spaces or _ . ' -`);
  return name;
}

class JsonFile {
  constructor(file, empty) {
    this.file = file;
    this.empty = empty;
    this.data = null;
    this.stamp = null;
    this.queue = Promise.resolve();
  }

  stat() {
    try {
      const s = fs.statSync(this.file);
      return `${s.ino}:${s.size}:${s.mtimeMs}`;
    } catch (error) {
      if (error.code === 'ENOENT') return 'missing';
      throw error;
    }
  }

  read() {
    const stamp = this.stat();
    if (this.data && stamp === this.stamp) return this.data;
    let data = this.empty();
    if (stamp !== 'missing') {
      data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const k of Object.keys(this.empty())) if (!Array.isArray(data[k])) throw new Error(`${this.file}: ${k} is not a list`);
    }
    this.data = data;
    this.stamp = stamp;
    return data;
  }

  update(fn) {
    const run = this.queue.then(async () => {
      const next = structuredClone(this.read());
      const result = fn(next);
      await writeAtomic(this.file, JSON.stringify(next, null, 1) + '\n');
      this.data = next;
      this.stamp = this.stat();
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }
}

export async function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}-${randomId(6)}`;
  const fh = await fs.promises.open(tmp, 'w', 0o600);
  try {
    await fh.writeFile(text);
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await fs.promises.rename(tmp, file);
  } catch (error) {
    await fs.promises.rm(tmp, { force: true });
    throw error;
  }
  const dir = await fs.promises.open(path.dirname(file), 'r').catch(() => null);
  if (dir) await dir.sync().catch(() => {}).finally(() => dir.close());
}

export class RateLimiter {
  constructor(now = Date.now, maxKeys = 20000) {
    this.now = now;
    this.maxKeys = maxKeys;
    this.hits = new Map();
  }

  take(kind, key, rules) {
    const id = `${kind}\0${key}`;
    const t = this.now();
    const longest = Math.max(...rules.map(([, w]) => w));
    const list = (this.hits.get(id) ?? []).filter((x) => t - x < longest);
    for (const [max, windowMs] of rules) {
      const inWindow = list.filter((x) => t - x < windowMs);
      if (inWindow.length >= max) {
        this.hits.set(id, list);
        const retry = Math.ceil((inWindow[0] + windowMs - t) / 1000);
        throw new HttpError(429, 'too many requests, try again later', { 'Retry-After': String(Math.max(retry, 1)) });
      }
    }
    list.push(t);
    this.hits.delete(id);
    this.hits.set(id, list);
    if (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value);
  }
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function readBody(req, limit) {
  const declared = Number(req.headers['content-length']);
  if (declared > limit) return Promise.reject(new HttpError(413, 'request body too large'));
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const fail = (error) => {
      if (done) return;
      done = true;
      req.resume();
      reject(error);
    };
    const timer = setTimeout(() => fail(new HttpError(408, 'request body timed out')), 10e3);
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) return fail(new HttpError(413, 'request body too large'));
      chunks.push(chunk);
    });
    req.on('end', () => {
      clearTimeout(timer);
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (error) => {
      clearTimeout(timer);
      fail(error);
    });
  });
}

export function createLoadouts({ site, dir, publicBase, now = Date.now }) {
  const base = new URL(publicBase);
  const basePath = base.pathname.replace(/\/?$/, '/');
  const secure = base.protocol === 'https:';
  const limiter = new RateLimiter(now);
  const enabled = Boolean(dir);
  let loadouts;
  let accounts;
  if (enabled) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    loadouts = new JsonFile(path.join(dir, 'loadouts.json'), () => ({ loadouts: [] }));
    accounts = new JsonFile(path.join(dir, 'accounts.json'), () => ({ profiles: [], sessions: [] }));
    loadouts.read();
    accounts.read();
  }

  const publicLoadout = (l) => ({ id: l.id, title: l.title, author: l.author, verified: l.verified, code: l.code, vehicleId: l.vehicleId, createdAt: l.createdAt });

  function clientIp(req) {
    const remote = req.socket.remoteAddress ?? '';
    const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').pop().trim();
    return loopback && forwarded ? forwarded : remote;
  }

  function cookie(value, maxAge) {
    return [`${COOKIE}=${value}`, `Path=${basePath}`, `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Strict', ...(secure ? ['Secure'] : [])].join('; ');
  }

  function currentProfile(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) return { profile: null, token: null };
    const data = accounts.read();
    const hash = sha256(token);
    const session = data.sessions.find((s) => s.hash === hash && s.expiresAt > now());
    const profile = session && data.profiles.find((p) => p.id === session.profileId);
    return { profile: profile ?? null, token, stale: !profile };
  }

  function startSession(data, profileId) {
    const token = randomId(32);
    const t = now();
    data.sessions = data.sessions.filter((s) => s.expiresAt > t);
    const mine = data.sessions.filter((s) => s.profileId === profileId);
    if (mine.length >= LIMITS.sessionsPerProfile) {
      const drop = new Set(mine.slice(0, mine.length - LIMITS.sessionsPerProfile + 1).map((s) => s.hash));
      data.sessions = data.sessions.filter((s) => !drop.has(s.hash));
    }
    data.sessions.push({ hash: sha256(token), profileId, expiresAt: t + LIMITS.sessionDays * 86400e3 });
    return cookie(token, LIMITS.sessionDays * 86400);
  }

  function validateBuild(rawCode, rawTitle) {
    if (typeof rawCode !== 'string' || !CODE_RE.test(rawCode)) throw new HttpError(400, 'code is not a build code');
    if (rawTitle != null && typeof rawTitle !== 'string') throw new HttpError(400, 'title must be a string');
    const { sharing, core, idx } = site;
    let decoded;
    try {
      decoded = sharing.decodeShare(rawCode);
    } catch {
      throw new HttpError(400, 'code is not a build code');
    }
    const sel = core.normalizeSelection(idx, decoded.sel);
    let same;
    try {
      same = sharing.encodeShare(sel, '') === sharing.encodeShare(decoded.sel, '');
    } catch {
      same = false;
    }
    if (!same || sel.vehicleId !== decoded.sel.vehicleId) throw new HttpError(400, 'build does not match the current game data');
    if (core.totalPoints(sel) > core.BUDGET) throw new HttpError(400, `build spends more than ${core.BUDGET} talent points`);
    const nodes = core.getPlannerTalentsForVehicle(idx, sel.vehicleId);
    for (const node of nodes) {
      if (!(sel.talentPoints[node.talent.id] > 0)) continue;
      const issues = core.nodeIssues(node, nodes, sel.talentPoints);
      if (issues.tier > 0 || issues.prerequisites.length) throw new HttpError(400, `build is not legal: ${node.talent.name} is locked`);
    }
    const vehicle = idx.vehicleById.get(sel.vehicleId);
    const title = sharing.buildTitle(cleanText(rawTitle ?? '', LIMITS.title) || cleanText(decoded.t, LIMITS.title) || `${vehicle.name} build`).trim();
    return { code: sharing.encodeShare(sel, title), title, vehicleId: sel.vehicleId };
  }

  async function postLoadout(req, body) {
    const ip = clientIp(req);
    const { profile } = currentProfile(req);
    const build = validateBuild(body.code, body.title);
    let author;
    if (profile) {
      author = profile.name;
    } else if (body.author == null || (typeof body.author === 'string' && !cleanText(body.author, LIMITS.name))) {
      author = 'Anonymous';
    } else {
      author = validName(body.author, 'author');
      const fold = foldName(author);
      if (RESERVED.has(fold) && fold !== 'anonymous') throw new HttpError(400, 'that author name is reserved');
      if (accounts.read().profiles.some((p) => p.fold === fold)) throw new HttpError(409, 'that name belongs to a profile: sign in to post as it');
    }
    limiter.take('post', ip, RATES.post);
    if (profile) limiter.take('post-profile', profile.id, RATES.post);
    limiter.take('post', '*', RATES.postGlobal);
    const entry = await loadouts.update((data) => {
      if (data.loadouts.some((l) => l.code === build.code)) throw new HttpError(409, 'this build is already posted');
      const t = now();
      const createdAt = new Date(Math.max(t, Date.parse(data.loadouts.at(-1)?.createdAt ?? 0) || 0)).toISOString();
      const item = { id: randomId(9), ...build, author, verified: Boolean(profile), createdAt, ...(profile ? { profileId: profile.id } : {}) };
      data.loadouts.push(item);
      if (data.loadouts.length > LIMITS.stored) data.loadouts.splice(0, data.loadouts.length - LIMITS.stored);
      return item;
    });
    return [201, { loadout: publicLoadout(entry) }];
  }

  async function profileAction(req, body) {
    const ip = clientIp(req);
    if (body.action === 'create') {
      const name = validName(body.name, 'name');
      const fold = foldName(name);
      if (RESERVED.has(fold)) throw new HttpError(400, 'that name is reserved');
      if (accounts.read().profiles.some((p) => p.fold === fold)) throw new HttpError(409, 'that name is taken');
      limiter.take('create', ip, RATES.create);
      limiter.take('create', '*', RATES.createGlobal);
      const key = `tyrk_${randomId(32)}`;
      const setCookie = await accounts.update((data) => {
        if (data.profiles.some((p) => p.fold === fold)) throw new HttpError(409, 'that name is taken');
        if (data.profiles.length >= LIMITS.profiles) throw new HttpError(503, 'no new profiles right now');
        const profile = { id: randomId(12), name, fold, keyHash: sha256(key), createdAt: new Date(now()).toISOString() };
        data.profiles.push(profile);
        return startSession(data, profile.id);
      });
      return [201, { profile: { name }, key }, { 'Set-Cookie': setCookie }];
    }
    if (body.action === 'login') {
      limiter.take('login', ip, RATES.login);
      if (typeof body.key !== 'string' || !KEY_RE.test(body.key.trim())) throw new HttpError(401, 'that key does not match a profile');
      const hash = sha256(body.key.trim());
      const result = await accounts.update((data) => {
        const profile = data.profiles.find((p) => crypto.timingSafeEqual(Buffer.from(p.keyHash), Buffer.from(hash)));
        if (!profile) throw new HttpError(401, 'that key does not match a profile');
        return { name: profile.name, setCookie: startSession(data, profile.id) };
      });
      return [200, { profile: { name: result.name } }, { 'Set-Cookie': result.setCookie }];
    }
    if (body.action === 'logout') {
      const { token } = currentProfile(req);
      if (token) {
        const hash = sha256(token);
        if (accounts.read().sessions.some((s) => s.hash === hash)) await accounts.update((data) => { data.sessions = data.sessions.filter((s) => s.hash !== hash); });
      }
      return [200, { profile: null }, { 'Set-Cookie': cookie('', 0) }];
    }
    throw new HttpError(400, 'action must be create, login or logout');
  }

  function checkOrigin(req) {
    const origin = req.headers.origin;
    if (origin && origin !== base.origin) throw new HttpError(403, 'cross-origin requests are not allowed');
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'cross-origin requests are not allowed');
  }

  async function postBody(req) {
    checkOrigin(req);
    if (!/^application\/json\s*(;|$)/i.test(String(req.headers['content-type'] ?? ''))) throw new HttpError(415, 'send JSON (Content-Type: application/json)');
    const text = await readBody(req, LIMITS.body);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new HttpError(400, 'body is not valid JSON');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'body must be a JSON object');
    return body;
  }

  async function route(req, rest) {
    if (!enabled) throw new HttpError(503, 'loadouts are not enabled on this server');
    if (rest === 'loadouts') {
      if (req.method === 'GET' || req.method === 'HEAD') {
        const list = loadouts.read().loadouts.slice(-LIMITS.listed).reverse().map(publicLoadout);
        return [200, { loadouts: list }];
      }
      if (req.method === 'POST') return postLoadout(req, await postBody(req));
      throw new HttpError(405, 'method not allowed', { Allow: 'GET, HEAD, POST' });
    }
    if (rest === 'profile') {
      if (req.method === 'GET' || req.method === 'HEAD') {
        const { profile, stale } = currentProfile(req);
        return [200, { profile: profile ? { name: profile.name } : null }, stale ? { 'Set-Cookie': cookie('', 0) } : {}];
      }
      if (req.method === 'POST') return profileAction(req, await postBody(req));
      throw new HttpError(405, 'method not allowed', { Allow: 'GET, HEAD, POST' });
    }
    throw new HttpError(404, 'not found');
  }

  async function handle(req, res, pathname) {
    if (!pathname.startsWith(`${basePath}api/`)) return false;
    const rest = pathname.slice(basePath.length + 4).replace(/\/$/, '');
    let status;
    let payload;
    let headers = {};
    try {
      [status, payload, headers = {}] = await route(req, rest);
    } catch (error) {
      if (error instanceof HttpError) {
        [status, payload, headers] = [error.status, { error: error.message }, error.headers];
      } else {
        console.error(new Date().toISOString(), req.method, pathname, error);
        [status, payload] = [500, { error: 'server error' }];
      }
    }
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
      ...(status === 408 || status === 413 ? { Connection: 'close' } : {}),
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }

  return { handle, enabled, basePath };
}

async function cli(argv) {
  const dir = stateDirFromEnv();
  if (!dir) throw new Error('set LOADOUTS_DIR (or STATE_DIRECTORY) to the state directory, for example /var/lib/tyr-planner-loadouts');
  const file = new JsonFile(path.join(dir, 'loadouts.json'), () => ({ loadouts: [] }));
  const [command, ...args] = argv;
  if (command === 'list') {
    const list = file.read().loadouts.slice(-Number(args[0] || 50)).reverse();
    for (const l of list) console.log([l.id, l.createdAt, l.verified ? `${l.author} (profile)` : l.author, l.vehicleId, JSON.stringify(l.title)].join('\t'));
    return;
  }
  if (command === 'remove') {
    if (!args.length) throw new Error('usage: remove <id>...');
    const ids = new Set(args);
    const removed = await file.update((data) => {
      const before = data.loadouts.length;
      data.loadouts = data.loadouts.filter((l) => !ids.has(l.id));
      return before - data.loadouts.length;
    });
    console.log(`removed ${removed}`);
    return;
  }
  if (command === 'remove-author') {
    const name = args.join(' ');
    if (!name) throw new Error('usage: remove-author <name>');
    const fold = foldName(name);
    const removed = await file.update((data) => {
      const before = data.loadouts.length;
      data.loadouts = data.loadouts.filter((l) => foldName(l.author) !== fold);
      return before - data.loadouts.length;
    });
    console.log(`removed ${removed}`);
    return;
  }
  if (command === 'remove-profile') {
    const name = args.join(' ');
    if (!name) throw new Error('usage: remove-profile <name>');
    const fold = foldName(name);
    const accounts = new JsonFile(path.join(dir, 'accounts.json'), () => ({ profiles: [], sessions: [] }));
    const removed = await accounts.update((data) => {
      const ids = new Set(data.profiles.filter((p) => p.fold === fold).map((p) => p.id));
      data.profiles = data.profiles.filter((p) => !ids.has(p.id));
      data.sessions = data.sessions.filter((s) => !ids.has(s.profileId));
      return ids.size;
    });
    console.log(`removed ${removed} profile(s); their posts stay until remove-author`);
    return;
  }
  throw new Error('usage: node loadouts.mjs list [n] | remove <id>... | remove-author <name> | remove-profile <name>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  cli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
