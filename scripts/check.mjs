// Offline checks, run by `npm test` and by the Pages workflow before publishing:
//   1. stat engine parity: the reference build otf4zfz9 ("official costco build") against the numbers
//      tyrhq.com showed for it on 2026-11-11 (GameData CL 37952; other game versions only check that
//      every tank's stats compute, since a balance patch changes the numbers);
//   2. share links and TYR01 game codes: round trips, byte parity with a code exported from tyrhq.com,
//      UTF-16 names, and rejection of malformed codes.
import assert from 'node:assert/strict';
import path from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';
import { canIncrementTalentPoint, computeBuild, computeBuildFirepower, createPlannerCatalog, getDefaultSelection, getPlannerTalentsForVehicle } from '../site/vendor/tyrhq-engine.js';
import { encodeShare, decodeShare, encodeGameCode, decodeGameCode, buildUrl, buildTitle, PUBLIC_URL } from '../site/sharing.js';
import { CODE_RE } from '../server/build.mjs';
import { MAX_SAVED, selectionKey, parseSaved, putSaved, renameSaved, removeSaved, snapshotName } from '../site/saved.js';
import { normalizeSelection } from '../site/core.js';
import { loadBundle } from './gamedata.mjs';

const bundle = loadBundle(path.resolve(import.meta.dirname, '..'));
const index = createPlannerCatalog(bundle);
const REFERENCE_CL = 37952; // the game version the expected numbers below were read for

// ---------- 1. engine parity ----------
const reference = {
  ammoIds: ['standard', 'highexplosive', 'abilityresource'],
  vehicleId: 'vanguard',
  componentIds: ['signatureobscurer', 'shiftcloak', 'shellcharger'],
  talentPoints: {
    'vanguard-talent001': 5,
    'vanguard-talent002': 2,
    'vanguard-talent005': 1,
    'vanguard-talent006': 5,
    'vanguard-talent007': 3,
    'vanguard-talent015': 2,
    'vanguard-talent016': 2,
    'vanguard-talent018': 5,
    'vanguard-talent022': 5,
    'vanguard-talent026': 1,
  },
  previewAmmoSlot: 0,
};

const expected = {
  ShellDamage: 233.5,
  CamoPercentage: 56.2,
  MaxSpeed: 75.26,
  StartingSecondaryShellsCount: 12,
  StartingTertiaryShellsCount: 3,
  GunMaxDepression: -11,
  PreciseDispersionTime: 2.5,
  DispersionReductionSpeed: 0.847,
};

for (const v of index.vehicles) {
  const stock = getDefaultSelection(index, v.id);
  assert.ok(computeBuild(index, stock)?.statCards.length, `no stats for ${v.id}`);
  assert.ok(Number.isFinite(computeBuildFirepower(index, stock).guaranteed?.dpm), `no firepower for ${v.id}`);
}
const res = computeBuild(index, reference);
assert.ok(res, 'engine returned no result');
const changelist = bundle.metadata?.sourceChangelist;
if (changelist !== REFERENCE_CL) console.log(`GameData CL ${changelist}: reference numbers are for CL ${REFERENCE_CL}, shown but not enforced`);
let failures = 0;
for (const [key, want] of Object.entries(expected)) {
  const got = res.stats[key];
  const ok = Math.abs(got - want) < 0.01;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${key.padEnd(32)} ${String(Math.round(got * 1000) / 1000).padStart(9)} expected ${want}`);
}
const fire = computeBuildFirepower(index, reference);
console.log(`     dpm ${fire.guaranteed.dpm.toFixed(2)} / ${fire.withConditional.dpm.toFixed(2)} conditional`);
if (changelist === REFERENCE_CL) assert.equal(failures, 0, `${failures} stat mismatch(es) against tyrhq.com (233.5 damage, 56.2 % camo, 75.26 kph)`);

if (bundle.metadata.patches.includes('11/19/26 balance patch')) {
  for (const [id, hp] of [['blink', 1000], ['vtol', 950], ['drone', 1050], ['stealth', 950], ['seeker', 1000], ['vanguard', 1000]]) {
    assert.equal(computeBuild(index, getDefaultSelection(index, id)).stats.MaxHealth, hp, `${id} stock health`);
  }
  const atlas = computeBuild(index, getDefaultSelection(index, 'sonar')).stats;
  assert.equal(atlas.ReloadTime, 14);
  assert.equal(atlas.GunMaxDepression, -7.5);
  assert.equal(index.vehicleById.get('deadeye').stats.AbilityDuration, 17);
  const byComponent = (id) => index.componentById.get(id);
  assert.match(byComponent('weaknessanalyzer').description, /1\.5 seconds/);
  assert.match(byComponent('adaptivehardening').description, /12% cap after 40 seconds/);
  assert.match(byComponent('fabricator').description, /2 Tertiary Shells every 60 seconds/);
  assert.doesNotMatch(byComponent('fabricator').description, /secondary/i);
  assert.match(index.vehicleById.get('seeker').ability.description, /flight speed by 50%/);
  const fixture = structuredClone(bundle);
  fixture.vehicles.find((v) => v.id === 'vanguard').stats.StartingTertiaryShellsCount = 3;
  const fixtureIndex = createPlannerCatalog(fixture);
  const armed = { ...getDefaultSelection(fixtureIndex, 'vanguard'), componentIds: [] };
  const base = computeBuild(fixtureIndex, armed).stats;
  const duplicate = computeBuild(fixtureIndex, { ...armed, componentIds: ['duplicator'] }).stats;
  assert.equal(base.StartingTertiaryShellsCount, 3);
  assert.equal(duplicate.StartingTertiaryShellsCount, base.StartingTertiaryShellsCount);
  assert.equal(duplicate.StartingSecondaryShellsCount, 2 * base.StartingSecondaryShellsCount);
  assert.equal(duplicate.ShellDamage, base.ShellDamage + 5);
  assert.equal(computeBuild(index, { ...armed, componentIds: ['weaknessanalyzer'] }).stats.ActiveReloadReductionTime, 1.5);
  console.log('November 19 overlay ok: light-tank health, Atlas stats, Seeker, and four components');
}

if (index.talentTreeById.get('terrapin')?.version === 37081) {
  const terrapin = getDefaultSelection(index, 'terrapin');
  assert.equal(terrapin.vehicleId, 'terrapin');
  assert.equal(computeBuild(index, terrapin).stats.MaxHealth, 1450);
  const nodes = getPlannerTalentsForVehicle(index, terrapin.vehicleId);
  assert.equal(nodes.length, 22);
  const node = (n) => nodes.find(({ talent }) => talent.id === `terrapin-talent${n}`);
  assert.deepEqual(node('007').prerequisiteIds, ['terrapin-talent003']);
  assert.deepEqual(nodes.filter((n) => n.isKeystone).map((n) => n.talent.name), ['Shelled Reload', 'Shell Break']);
  assert.deepEqual(node('027').talent.pointValues, [6]);
  const shelled = { ...terrapin, talentPoints: { 'terrapin-talent026': 1 } };
  assert.equal(computeBuild(index, shelled, { includeConditionalEffects: false }).stats.ReloadTime, 14);
  assert.equal(computeBuild(index, shelled).stats.ReloadTime, 12.6);
  assert.equal(computeBuild(index, shelled).breakdown.ReloadTime[0].conditional, true);
  assert.equal(canIncrementTalentPoint(node('007'), nodes, { 'terrapin-talent002': 2, 'terrapin-talent003': 3 }, 0, 1, 5), false);
  assert.equal(canIncrementTalentPoint(node('007'), nodes, { 'terrapin-talent003': 5 }, 0, 1, 5), true);
  const gameExports = [
    'TYR01_OQMAAHicldC9asMwEAfwy0enZMuWobSlkGQRsgppMgYPGUuwyS7MpRaVJSHLCX6Lvl7fpqoJ1BkcrEEITr8T9785AOx5gUbymhwxF5lEkqK13AgFI__60haxLoxWqFxJPs5oT1JfkrxSDh471KES2VcitYPnDpHkKGWcc_uJFoYevbbhrigqJZzQiqS1QbL3jitXcdXb_YWY-eOwdE_LWJt6db1gfjf99LYJfr4BJr62aHelXPoYqcX_xmuN0jd4COEbGIfwdxgE8Ig1y-3LGW321vv3KCxq2DB0HcSjbdAwjAUtkq0b_gvhxPpg',
    'TYR01_OQMAAHicldC9bsIwEAfwaylT2dgYKqiQCovluFJpR5QhI0KJ2K3oIFYd2zJOq7wFr8fb1HxIhCFVPFiWzr-z7n8jAEh4iUbymmywELlEkqG13AgFPf_62hSxLo1WqNyerH7QbqX-TYtKOXhpUetK5N-p1A4mLSItUMq44HaHFh49mjbhsiwrJZzQimS1QZJ4x5WruOrsTiGG_jjcu_Es1qaeXy8Y_Zt-cN8ExwPAs6-9NbsyLn2MzOKt8Vqj9B36IfwTnkL4Ah4CeMTOy-3KGT3vrfPvUVjUsGHoRxCPvoKGYSxokeyy9z_hyvph',
  ];
  for (const [i, code] of gameExports.entries()) {
    const decoded = await decodeGameCode(index, code);
    assert.deepEqual(decoded.warnings, []);
    assert.equal(decoded.selection.vehicleId, 'terrapin');
    assert.equal(decoded.selection.talentPoints[`terrapin-talent0${26 + i}`], 1);
    assert.equal(Object.values(decoded.selection.talentPoints).reduce((sum, n) => sum + n, 0), 31);
    const output = await encodeGameCode(index, decoded.selection, decoded.name);
    assert.deepEqual(await decodeGameCode(index, output), decoded);
    assert.deepEqual(decodeShare(encodeShare(decoded.selection, decoded.name)), { t: decoded.name, sel: decoded.selection });
  }
  console.log('Terrapin ok: stock health, tree layout, Shelled Reload, two game exports at tree version 37081');
}

// ---------- 2. sharing ----------
// Share links round-trip for every tank's stock build and for random builds.
let seed = 1;
const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (list) => list[Math.floor(random() * list.length)];
const shells = index.ammo.filter((a) => a.selectable).map((a) => a.id);
const samples = [];
for (const v of index.vehicles) {
  samples.push(getDefaultSelection(index, v.id));
  for (let k = 0; k < 20; k += 1) {
    const s = getDefaultSelection(index, v.id);
    const comps = [...index.components.map((c) => c.id)].sort(() => random() - 0.5);
    s.componentIds = s.componentIds.map((_, i) => (random() < 0.2 ? '' : comps[i]));
    s.ammoIds = [s.ammoIds[0], pick(shells), pick(shells)];
    s.previewAmmoSlot = Math.floor(random() * 3);
    for (const n of getPlannerTalentsForVehicle(index, v.id)) if (random() < 0.4) s.talentPoints[n.talent.id] = 1 + Math.floor(random() * n.maxPoints);
    samples.push(s);
  }
}
for (const s of samples) assert.deepEqual(decodeShare(encodeShare(s, 'Sample')), { t: 'Sample', sel: s });

const imported = { ...reference, talentPoints: { ...reference.talentPoints, 'ram-talent001': 2 } };
const normalized = normalizeSelection(index, imported);
assert.deepEqual(normalized, reference);
const longTitle = '盾'.repeat(47) + '🚀'.repeat(160);
const draftUrl = new URL(buildUrl(PUBLIC_URL, normalized, longTitle));
assert.equal(draftUrl.hash, '');
const draftCode = draftUrl.pathname.split('/').at(-1);
assert.equal(draftUrl.href, `${PUBLIC_URL}b/${draftCode}`);
assert.match(draftCode, CODE_RE);
assert.equal(buildTitle(longTitle), '盾'.repeat(47));
assert.deepEqual(decodeShare(draftCode), { t: buildTitle(longTitle), sel: reference });
assert.equal(buildUrl('https://example.com/planner/', normalized, longTitle), `https://example.com/planner/#s=${draftCode}`);

const entry = { title: 'Fuse build', sel: reference };
const oldList = parseSaved(JSON.stringify([entry, { ...entry, title: 'Fuse Build' }]));
assert.equal(snapshotName(oldList, 'Fuse build'), 'Fuse build 2');
assert.equal(renameSaved(oldList, 'Fuse build', 'Fuse Build'), null);
assert.deepEqual(removeSaved(oldList, 'Fuse Build'), [entry]);
assert.equal(renameSaved(oldList, 'Fuse build', 'Flanker')[0].title, 'Flanker');
const revision = { ...entry, sel: { ...reference, previewAmmoSlot: 1 } };
assert.notEqual(selectionKey(revision.sel), selectionKey(reference));
assert.deepEqual(putSaved(oldList, revision), { list: [revision, oldList[1]], replaced: entry, dropped: [] });
const fullList = Array.from({ length: MAX_SAVED }, (_, i) => ({ ...entry, title: String(i) }));
assert.deepEqual(putSaved(fullList, entry).dropped, [fullList.at(-1)]);

const build = { title: 'official costco build', selection: reference };
const originalCode = 'TYR01_JAMAAHicldJPS8NAEAXwp-LFD-ChF-tF8RKaQFOvJYjeihp632wnydDNbtg_Yr69WASLktCd4_Kb5fGYGYBn0VGvxJBsqWWpKNkK3QRhd7gAcHcsCtP1RpP2LnnnRgsfLG0qJ4Mli5sx2XLtC2XEHrejhJQqWmEbsjgHcH8M110XNHs2OimHnpIXbtqnz14Zxx-Ehym6rlixH97ImWAl4XuuAZi6ZslCzaVxXpp5FVjtMJtsY3xv8wpc_U1dCkXal5Z-v_h5WyxSXMbw7H8nU3yJsxiex4VZHc7iVJ4uo7KneRx_jMqeZXE8PxT5BfyS9qY';
const payload = (code) => {
  const bytes = Buffer.from(code.slice(6), 'base64url');
  const binary = inflateSync(bytes.subarray(4));
  assert.equal(binary.length, bytes.readInt32LE(0));
  return binary;
};
assert.deepEqual(payload(await encodeGameCode(index, build.selection, build.title)), payload(originalCode));

const unicodeTitle = 'Éclair ⚔️ 坦克 🚀';
assert.deepEqual(decodeShare(encodeShare(build.selection, unicodeTitle)), { t: unicodeTitle, sel: build.selection });
const binary = payload(await encodeGameCode(index, build.selection, unicodeTitle));
let offset = 0;
function int32() {
  const value = binary.readInt32LE(offset);
  offset += 4;
  return value;
}
function string() {
  const size = int32();
  if (!size) return '';
  const width = size < 0 ? 2 : 1;
  const bytes = binary.subarray(offset, offset + Math.abs(size) * width);
  offset += bytes.length;
  assert.equal(width === 2 ? bytes.readUInt16LE(bytes.length - 2) : bytes.at(-1), 0);
  return bytes.subarray(0, -width).toString(width === 2 ? 'utf16le' : 'latin1');
}
function tags() {
  return Array.from({ length: int32() }, string);
}
assert.equal(string(), 'Gameplay.Vehicle.Vanguard');
assert.deepEqual(tags(), ['Gameplay.Components.SignatureObscurer', 'Gameplay.Components.ShiftCloak', 'Gameplay.Components.ShellCharger']);
assert.deepEqual(tags(), ['Gameplay.Ammunition.Type.HighExplosive', 'Gameplay.Ammunition.Type.AbilityResource']);
assert.equal(int32(), 0);
assert.equal(string(), unicodeTitle);
assert.equal(string(), 'Gameplay.Vehicle.Vanguard');
assert.equal(string(), unicodeTitle);
assert.equal(int32(), index.talentTreeById.get('vanguard').version);
const allocations = Array.from({ length: int32() }, () => [string(), int32()]);
assert.deepEqual(Object.fromEntries(allocations), Object.fromEntries(Object.entries(build.selection.talentPoints).map(([id, points]) => [index.talentById.get(id).key, points])));
assert.equal(offset, binary.length);
assert.throws(() => decodeShare('AQ'), /share link/);
assert.throws(() => decodeShare('not a code'), /share link/);

const defaults = getDefaultSelection(index, 'vanguard');
const original = await decodeGameCode(index, originalCode);
assert.deepEqual(original.selection, { ...build.selection, previewAmmoSlot: defaults.previewAmmoSlot });
assert.equal(original.name, build.title);
assert.deepEqual(original.warnings, []);

const gameSample = await decodeGameCode(index, 'TYR01_JQEAAHicfc89CsJAEAXgQTtPkM6fxm7BI6j4gxgQkfSbdUgGZ3eWzUbMob2D0SoWyYOp3jfFSwDgoC161o3KsCTDqK5oNDOM227W7bdivTh0sVJZzW4TUD8wwLzHpGSCXFhHcgVMe9Be54GMjhJg1JJll62trR1FEqdujUd1pKLcvTxLRU-ExRBNJSem2MA3k_bOou9Sx9kKkoHJ__J9-r3DB8bbWXk');
assert.deepEqual(gameSample.selection, {
  vehicleId: 'recall',
  ammoIds: ['standard', 'highexplosive', 'mobility'],
  componentIds: ['vulnbreaker', 'microplating', 'fabricator'],
  talentPoints: {},
  previewAmmoSlot: 0,
});
assert.equal(gameSample.name, 'Loadout 1');

const unicode = await decodeGameCode(index, await encodeGameCode(index, build.selection, unicodeTitle));
assert.equal(unicode.name, unicodeTitle);
assert.deepEqual(unicode.selection.talentPoints, build.selection.talentPoints);

const tree = index.talentTreeById.get('vanguard');
const sparse = {
  ...defaults,
  ammoIds: ['standard', 'standard', 'abilityresource'],
  componentIds: ['', 'shiftcloak', ''],
  talentPoints: { [tree.nodes[0].talentId]: 1, [tree.nodes[2].talentId]: index.talentById.get(tree.nodes[2].talentId).maxPoints },
};
const roundTrip = await decodeGameCode(index, await encodeGameCode(index, sparse, 'Sparse'));
assert.deepEqual(roundTrip, { selection: sparse, name: 'Sparse', warnings: [] });

const writer = () => {
  const parts = [];
  const api = {
    int(value) { const b = Buffer.alloc(4); b.writeInt32LE(value); parts.push(b); return api; },
    str(value) {
      if (!value) return api.int(0);
      if (/[^\x00-\x7f]/.test(value)) { api.int(-(value.length + 1)); parts.push(Buffer.from(value + '\0', 'utf16le')); }
      else { api.int(value.length + 1); parts.push(Buffer.from(value + '\0', 'latin1')); }
      return api;
    },
    tags(values) { api.int(values.length); values.forEach(api.str); return api; },
    done() { return Buffer.concat(parts); },
  };
  return api;
};
const wrap = (binary, size = binary.length, extra = Buffer.alloc(0)) => {
  const head = Buffer.alloc(4);
  head.writeInt32LE(size);
  return 'TYR01_' + Buffer.concat([head, deflateSync(binary), extra]).toString('base64url');
};
const vanguard = 'Gameplay.Vehicle.Vanguard';
const talentKey = (id) => index.talentById.get(id).key;
const build2 = (options = {}) => {
  const { vehicle = vanguard, components = ['', '', ''], ammo = ['Gameplay.Ammunition.Type.Standard', 'Gameplay.Ammunition.Type.Standard'], name = 'T', treeVehicle = vehicle, version = tree.version, talents = [] } = options;
  const w = writer().str(vehicle).tags(components).tags(ammo).int(0).str(name).str(treeVehicle).str(name).int(version).int(talents.length);
  for (const [key, points] of talents) w.str(key).int(points);
  return w.done();
};
const good = build2();
assert.equal((await decodeGameCode(index, wrap(good))).selection.vehicleId, 'vanguard');

const fails = async (code, pattern) => assert.rejects(() => decodeGameCode(index, code), pattern);
const goodCode = wrap(good);
await fails('', /TYR01_/);
await fails('TYR02_' + goodCode.slice(6), /TYR01_/);
await fails('TYR01_!!!', /base64url/);
await fails(goodCode.slice(0, -12), /Invalid game code/);
await fails(goodCode.slice(0, 12), /Invalid game code/);
await fails(wrap(good, 1 << 21), /declared size/);
await fails(wrap(good, 0), /declared size/);
await fails(wrap(good, good.length - 1), /larger than its declared size/);
await fails(wrap(good, good.length + 1), /declares/);
await fails(wrap(Buffer.concat([good, Buffer.from([0])])), /trailing/);
await fails(wrap(good, good.length, Buffer.from([0])), /Invalid game code/);
await fails(wrap(good.subarray(0, good.length - 2)), /Invalid game code/);
await fails(wrap(build2({ vehicle: 'Gameplay.Vehicle.Nope', treeVehicle: 'Gameplay.Vehicle.Nope' })), /Unknown vehicle/);
await fails(wrap(build2({ treeVehicle: 'Gameplay.Vehicle.Ram' })), /talent tree/);
await fails(wrap(build2({ components: ['Gameplay.Components.ShiftCloak', '', 'Gameplay.Components.ShiftCloak'] })), /duplicate component/);
await fails(wrap(Buffer.from([0x7f, 0xff, 0xff, 0xff])), /bad string length/);
await fails(wrap(writer().int(5).done().subarray(0, 4)), /bad string length|ends unexpectedly/);
await fails(wrap(Buffer.concat([Buffer.from([5, 0, 0, 0]), Buffer.from('ABCDE')])), /NUL/);
await fails(wrap(build2({ ammo: ['Gameplay.Ammunition.Type.Standard'] })), /ammo entries/);

const messy = await decodeGameCode(index, wrap(build2({
  version: tree.version + 1,
  components: ['Gameplay.Components.Nope', 'Gameplay.Components.ShiftCloak', ''],
  ammo: ['Gameplay.Ammunition.Type.Nope', 'Gameplay.Ammunition.Type.AbilityResource'],
  talents: [
    [talentKey(tree.nodes[0].talentId), 99],
    [talentKey(tree.nodes[tree.nodes.length - 1].talentId), 1],
    ['Gameplay.TalentTree.Vanguard.Talent999', 1],
    [index.talentById.get(index.talentTreeById.get('ram').nodes[0].talentId).key, 1],
  ],
})));
assert.deepEqual(messy.selection.componentIds, ['', 'shiftcloak', '']);
assert.deepEqual(messy.selection.ammoIds, [defaults.ammoIds[0], defaults.ammoIds[1], 'abilityresource']);
assert.deepEqual(messy.selection.talentPoints, {
  [tree.nodes[0].talentId]: index.talentById.get(tree.nodes[0].talentId).maxPoints,
  [tree.nodes[tree.nodes.length - 1].talentId]: 1,
});

const legacy = await decodeGameCode(index, wrap(build2({
  ammo: ['Gameplay.Ammunition.Type.HighExplosive', 'Gameplay.Ammunition.Type.Standard', 'Gameplay.Ammunition.Type.AbilityResource'],
})));
assert.deepEqual(legacy.selection.ammoIds, [defaults.ammoIds[0], 'standard', 'abilityresource']);
assert.deepEqual(legacy.warnings, []);
console.log(`sharing ok: ${samples.length} share links round-trip; game payload matches tyrhq.com's export; UTF-16 names and two configurable ammo slots preserved; game codes decode, round-trip and reject malformed input`);
