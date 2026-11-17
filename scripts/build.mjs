// Builds the static site into dist/:
//   1. copies site/,
//   2. writes dist/data.js: the GameData bundle, the talent icon list and, if data/builds.json exists,
//      the community builds,
//   3. adds ?v=<hash of the build> to every local script and stylesheet URL, so browsers and caches
//      pick up a new deploy without manual version bumps.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadBundle } from './gamedata.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, 'site');
const DIST = path.join(ROOT, 'dist');

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

const bundle = loadBundle(ROOT);
// Community builds are not part of the repository: data/ is local (see README, "Community builds").
const builds = readJson(path.join(ROOT, 'data', 'builds.json'), []);
const buildsMeta = readJson(path.join(ROOT, 'data', 'meta.json'), {});
const talentIcons = fs.readdirSync(path.join(SITE, 'images', 'talents')).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).sort();

const meta = {
  gameData: { changelist: bundle.metadata?.sourceChangelist ?? null, generatedAt: bundle.metadata?.generatedAt ?? null, patches: bundle.metadata?.patches ?? [] },
  builds: builds.length ? { count: builds.length, fetchedAt: buildsMeta.scrapedAt ?? null } : null,
};

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(SITE, DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'data.js'), [
  `export const META = ${JSON.stringify(meta)};`,
  `export const BUNDLE = ${JSON.stringify(bundle)};`,
  `export const BUILDS = ${JSON.stringify(builds)};`,
  `export const TALENT_ICONS = ${JSON.stringify(talentIcons)};`,
].join('\n') + '\n');

// Cache busting: one hash over every script, stylesheet and page in the build.
const text = fs.readdirSync(DIST, { recursive: true }).filter((f) => /\.(js|css|html)$/.test(f)).sort();
const hash = crypto.createHash('sha256');
for (const f of text) hash.update(f).update(fs.readFileSync(path.join(DIST, f)));
const version = hash.digest('hex').slice(0, 10);
const stamp = (url) => `${url}?v=${version}`;
for (const f of text) {
  const file = path.join(DIST, f);
  const src = fs.readFileSync(file, 'utf8');
  const out = f.endsWith('.html')
    ? src.replace(/((?:href|src)=")(\.\/[^"?#]+\.(?:js|css))"/g, (_, attr, url) => `${attr}${stamp(url)}"`)
    : src.replace(/(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.\.?\/[^'"?#]+\.js)\2/g, (_, lead, q, url) => `${lead}${q}${stamp(url)}${q}`);
  if (out !== src) fs.writeFileSync(file, out);
}

const size = (fs.statSync(path.join(DIST, 'data.js')).size / 1024 / 1024).toFixed(2);
console.log(`dist/ built (v=${version}): GameData CL ${meta.gameData.changelist}, data.js ${size} MiB, ` +
  `${bundle.vehicles.length} tanks, ${bundle.components.length} components, ${bundle.talents.length} talents, ` +
  `${builds.length} community builds`);
