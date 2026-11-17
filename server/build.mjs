// Decodes a share code and gathers everything a link preview needs, using the deployed site's own
// modules (data.js, core.js, sharing.js) from SITE_DIR, so previews always match the planner.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The built site stamps ?v=<hash> on module URLs; import core.js and sharing.js the same way the page
// does, so the engine is loaded once.
function moduleUrl(siteDir, name) {
  const html = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');
  const app = html.match(/src="\.\/app\.js(\?v=[\w]+)?"/);
  return pathToFileURL(path.join(siteDir, name)).href + (app?.[1] ?? '');
}

export async function loadSite(siteDir) {
  const [data, sharing, core] = await Promise.all(['data.js', 'sharing.js', 'core.js'].map((f) => import(moduleUrl(siteDir, f))));
  const idx = core.createPlannerCatalog(data.BUNDLE);
  const icons = new Set(data.TALENT_ICONS);
  const version = [data.META.gameData?.changelist ?? '', ...(data.META.gameData?.patches ?? []), data.META.builds?.fetchedAt ?? ''].join('-');
  return { siteDir, data, sharing, core, idx, icons, version };
}

const titleCase = (s) => String(s ?? '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

// Share codes are base64url; titles are capped in the planner at 48 characters.
export const CODE_RE = /^[\w-]{11,400}$/;

export function buildFromCode(site, code) {
  if (!CODE_RE.test(code)) return null;
  let decoded;
  try {
    decoded = site.sharing.decodeShare(code);
  } catch {
    return null;
  }
  const { core, idx } = site;
  const sel = core.normalizeSelection(idx, decoded.sel ?? decoded);
  const v = idx.vehicleById.get(sel.vehicleId);
  if (!v) return null;
  const rawTitle = String(decoded.t ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
  const nodes = core.getPlannerTalentsForVehicle(idx, v.id);
  const points = sel.talentPoints;
  const spent = core.totalPoints(sel);
  const components = sel.componentIds.map((id) => {
    const c = id ? idx.componentById.get(id) : null;
    return c ? { id, name: titleCase(c.name), category: c.category ?? '' } : null;
  });
  const shells = sel.ammoIds.map((id, i) => ({ slot: core.SLOT_NAMES[i], id, name: idx.ammoById.get(id)?.displayName ?? id }));
  const stats = core.headlineStats(idx, sel).map((s) => ({ ...s, d: (s.value ?? 0) - (s.base ?? 0) }));
  const keystones = nodes.filter((n) => n.isKeystone && (points[n.talent.id] || 0) > 0).map((n) => n.talent.name);
  return { code, sel, v, title: rawTitle, nodes, points, spent, budget: core.BUDGET, components, shells, stats, keystones, fmt: core.fmt, signed: core.signed, isZero: core.isZero };
}
