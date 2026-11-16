// TYR HQ link previews.
//   GET /hq/b/<code>       -> small HTML page with Open Graph / Twitter tags for Discord and other unfurlers
//                             (title and card only: the card carries the build, so the embed has no text
//                             summary); browsers are sent on to the planner at /hq/#s=<code>.
//   GET /hq/og/<code>.png  -> the rendered build card (1200x630).
// nginx proxies only those two prefixes here; everything else stays static.
import http from 'node:http';
import { loadSite, buildFromCode, CODE_RE } from './build.mjs';
import { renderCard, W, H } from './card.mjs';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const SITE_DIR = process.env.SITE_DIR || '/opt/data/www/hq';
const PUBLIC_BASE = (process.env.PUBLIC_BASE || 'https://popi.tech/hq/').replace(/\/?$/, '/');
const CARD_VERSION = '1';

const site = await loadSite(SITE_DIR);
const cacheKey = `${CARD_VERSION}-${site.version}`;
const pngCache = new Map(); // code -> Buffer, LRU by insertion order
const MAX_CACHE = 300;
let rendering = 0;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const CLASS_COLOR = { light: '#8fbbe6', medium: '#dcc27f', heavy: '#e3a08a' };

function page(b) {
  const appUrl = `${PUBLIC_BASE}#s=${b.code}`;
  const shareUrl = `${PUBLIC_BASE}b/${b.code}`;
  const image = `${PUBLIC_BASE}og/${b.code}.png?v=${cacheKey}`;
  const title = b.title ? `${b.title} · ${b.v.name}` : `${b.v.name} build`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)} · TYR HQ</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="${CLASS_COLOR[b.v.classId] ?? '#99f8ff'}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:url" content="${esc(shareUrl)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="${W}">
<meta property="og:image:height" content="${H}">
<meta property="og:image:alt" content="${esc(`${b.v.name} build: talents, components, shells and stats`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="icon" href="${PUBLIC_BASE}favicon.svg" type="image/svg+xml">
<link rel="canonical" href="${esc(shareUrl)}">
<script>location.replace(${JSON.stringify(appUrl)})</script>
<style>body{margin:0;background:#131820;color:#e8eeff;font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}a{color:#99f8ff}</style>
</head>
<body><p>Opening <a href="${esc(appUrl)}">${esc(title)}</a> in TYR HQ…</p></body>
</html>`;
}

function send(res, status, type, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(res.req.method === 'HEAD' ? undefined : body);
}

async function card(b) {
  const hit = pngCache.get(b.code);
  if (hit) {
    pngCache.delete(b.code);
    pngCache.set(b.code, hit);
    return hit;
  }
  if (rendering >= 4) throw Object.assign(new Error('busy'), { busy: true });
  rendering++;
  try {
    const png = await renderCard(site, b);
    pngCache.set(b.code, png);
    if (pngCache.size > MAX_CACHE) pngCache.delete(pngCache.keys().next().value);
    return png;
  } finally {
    rendering--;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'method not allowed', { Allow: 'GET, HEAD' });
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p === '/healthz') return send(res, 200, 'text/plain', `ok ${cacheKey}\n`);
    let m = p.match(/^\/hq\/b\/([^/]+)\/?$/);
    if (m) {
      const b = CODE_RE.test(m[1]) ? buildFromCode(site, m[1]) : null;
      if (!b) return send(res, 302, 'text/plain', 'unknown build', { Location: PUBLIC_BASE });
      return send(res, 200, 'text/html; charset=utf-8', page(b), { 'Cache-Control': 'public, max-age=300' });
    }
    m = p.match(/^\/hq\/og\/([^/]+)\.png$/);
    if (m) {
      const b = CODE_RE.test(m[1]) ? buildFromCode(site, m[1]) : null;
      if (!b) return send(res, 404, 'text/plain', 'unknown build');
      const png = await card(b);
      return send(res, 200, 'image/png', png, { 'Cache-Control': 'public, max-age=604800' });
    }
    return send(res, 404, 'text/plain', 'not found');
  } catch (error) {
    if (error.busy) return send(res, 503, 'text/plain', 'busy', { 'Retry-After': '2' });
    console.error(new Date().toISOString(), req.url, error);
    return send(res, 500, 'text/plain', 'error');
  }
});
server.listen(PORT, HOST, () => console.log(`tyrhq-embed on ${HOST}:${PORT}, site ${SITE_DIR}, data ${site.version}`));
