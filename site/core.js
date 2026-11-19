// Build logic shared by the planner (app.js) and the link-preview service (server/).
// No DOM here: it must import cleanly in Node.
import {
  canIncrementTalentPoint,
  computeBuild,
  computeBuildFirepower,
  createPlannerCatalog,
  fillTalentDescription,
  getDefaultSelection,
  getPlannerTalentsForVehicle,
  getPointsSpentInTiersBelow,
  getTalentTierUnlockRequirement,
  groupStatCards,
  MAX_TOTAL_TALENT_POINTS,
  talentPrerequisitesSatisfied,
} from './vendor/tyrhq-engine.js';

export {
  canIncrementTalentPoint,
  computeBuild,
  computeBuildFirepower,
  createPlannerCatalog,
  fillTalentDescription,
  getDefaultSelection,
  getPlannerTalentsForVehicle,
  getPointsSpentInTiersBelow,
  getTalentTierUnlockRequirement,
  groupStatCards,
};

export const BUDGET = MAX_TOTAL_TALENT_POINTS;
export const SLOT_NAMES = ['Primary', 'Secondary', 'Tertiary'];
export const CLASS_ORDER = { light: 0, medium: 1, heavy: 2 };
export const EPS = 1e-4;
export const HEADLINE = ['MaxHealth', 'ShellDamage', 'DPM', 'ReloadTime', 'MaxSpeed', 'CamoPercentage', 'DispersionReductionSpeed', 'AbilityCooldown'];

// Same order as the in-game Tanks screen (newest tanks last within each class).
export const GAME_ORDER = ['Alecto', 'Ikarus', 'Kestrel', 'Phantom', 'Fuse', 'Seeker',
  'Arbalest', 'Ark', 'Ranger', 'Rook', 'Tempest', 'Valor', 'Parallax',
  'Atlas', 'Fortis', 'Helio', 'Maul', 'Tricera'];
const gameRank = (v) => {
  const i = GAME_ORDER.indexOf(v?.name);
  return i < 0 ? GAME_ORDER.length : i;
};
export const byClass = (a, b) => (CLASS_ORDER[a.classId] ?? 3) - (CLASS_ORDER[b.classId] ?? 3) || gameRank(a) - gameRank(b) || String(a.name).localeCompare(String(b.name));

export function fmt(v) {
  if (v == null || !Number.isFinite(v)) return '-';
  let s;
  if (Math.abs(v - Math.round(v)) < EPS) s = String(Math.round(v));
  else if (Math.abs(v) < 1) s = v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  else if (Math.abs(v) >= 100) s = v.toFixed(1).replace(/\.0$/, '');
  else s = v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s.replace('-', '−');
}

export const signed = (v) => (v > 0 ? '+' : '') + fmt(v);
export const isZero = (d) => Math.abs(d) < EPS;
export const totalPoints = (sel) => Object.values(sel?.talentPoints ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);

// Talent or component text with its numbers filled in for the given rank.
export const describeTalent = (node, points) =>
  fillTalentDescription(node.talent.description, node.talent.pointValues, node.talent.valueTokens, points, node.maxPoints) || '';

// Turns any stored, shared or imported selection into a valid one for the current game data:
// unknown ids are dropped, shells and components follow the game's slot rules, ranks are capped.
export function normalizeSelection(idx, input) {
  const sel = input ?? {};
  const v = idx.vehicleById.get(sel.vehicleId) || idx.vehicles[0];
  const base = getDefaultSelection(idx, v.id);
  const ammoIds = SLOT_NAMES.map((_, i) => {
    if (i === 0) return base.ammoIds[0];
    const a = sel.ammoIds?.[i] ? idx.ammoById.get(sel.ammoIds[i]) : null;
    if (!a || !a.selectable) return base.ammoIds[i];
    if (i === 1 && a.id !== 'standard' && !a.canLoadSecondary) return base.ammoIds[i];
    return a.id;
  });
  const used = new Set();
  const componentIds = Array.from({ length: v.loadout.componentSlotCount }, (_, i) => {
    const id = sel.componentIds?.[i];
    if (!idx.componentById.has(id) || used.has(id)) return '';
    used.add(id);
    return id;
  });
  const talentPoints = {};
  const treeIds = new Set(idx.talentTreeById.get(v.id).nodes.map((node) => node.talentId));
  for (const [k, raw] of Object.entries(sel.talentPoints ?? {})) {
    const n = Math.floor(Number(raw));
    if (treeIds.has(k) && n > 0) talentPoints[k] = Math.min(n, idx.talentById.get(k).maxPoints);
  }
  const slot = Number(sel.previewAmmoSlot ?? v.loadout.previewAmmoSlot);
  return {
    vehicleId: v.id,
    ammoIds,
    componentIds,
    talentPoints,
    previewAmmoSlot: Math.min(Math.max(Number.isFinite(slot) ? Math.trunc(slot) : 0, 0), 2),
  };
}

// The stat tiles at the top of the stat panel (and on preview cards): value, stock value, label, unit.
export function headlineStats(idx, sel, res = computeBuild(idx, sel), fire = computeBuildFirepower(idx, sel)) {
  const cards = new Map(res.statCards.map((c) => [c.definition.key, c]));
  const out = [];
  for (const key of HEADLINE) {
    if (key === 'DPM') {
      const conditional = Math.round(fire.withConditional?.dpm ?? 0);
      out.push({ key, label: 'DPM', unit: '', value: Math.round(fire.guaranteed?.dpm ?? 0), base: Math.round(fire.base?.dpm ?? 0), lowerBetter: false, conditional });
      continue;
    }
    const c = cards.get(key);
    if (!c) continue;
    out.push({ key, label: c.definition.label, unit: c.definition.unit ?? '', value: c.value, base: c.base, lowerBetter: !!c.definition.lowerBetter, card: c });
  }
  return out;
}

// Prerequisite and tier-gate problems for one talent node.
export function nodeIssues(node, nodes, points) {
  const below = getPointsSpentInTiersBelow(nodes, points, node.tier);
  const required = getTalentTierUnlockRequirement(node.tier);
  const prerequisites = talentPrerequisitesSatisfied(node, points, nodes) ? [] : node.prerequisiteIds.map((id) => {
    const pre = nodes.find((n) => n.talent.id === id);
    return { id, name: pre?.talent.name ?? id, spent: points[id] || 0, required: pre?.maxPoints ?? 1 };
  }).filter((p) => p.spent < p.required);
  return { below, required, tier: Math.max(0, required - below), prerequisites };
}
