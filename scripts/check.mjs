// Offline checks, run by `npm test` and by the Pages workflow before publishing:
//   1. stat engine parity: the reference build otf4zfz9 ("official costco build") against the numbers
//      tyrhq.com showed for it on 2026-11-11;
//   2. share links and TYR01 game codes: round trips, byte parity with a code exported from tyrhq.com,
//      UTF-16 names, and rejection of malformed codes.
import assert from 'node:assert/strict';
import path from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';
import { computeBuild, computeBuildFirepower, createPlannerCatalog, getDefaultSelection, getPlannerTalentsForVehicle } from '../site/vendor/tyrhq-engine.js';
import { encodeShare, decodeShare, encodeGameCode, decodeGameCode } from '../site/sharing.js';
import { loadBundle } from './gamedata.mjs';

const index = createPlannerCatalog(loadBundle(path.resolve(import.meta.dirname, '..')));

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

const res = computeBuild(index, reference);
assert.ok(res, 'engine returned no result');
let failures = 0;
for (const [key, want] of Object.entries(expected)) {
  const got = res.stats[key];
  const ok = Math.abs(got - want) < 0.01;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${key.padEnd(32)} ${String(Math.round(got * 1000) / 1000).padStart(9)} expected ${want}`);
}
const fire = computeBuildFirepower(index, reference);
console.log(`     dpm ${fire.guaranteed.dpm.toFixed(2)} / ${fire.withConditional.dpm.toFixed(2)} conditional`);
assert.equal(failures, 0, `${failures} stat mismatch(es) against tyrhq.com (233.5 damage, 56.2 % camo, 75.26 kph)`);

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
