import { getDefaultSelection } from './vendor/tyrhq-engine.js';

const VEHICLES = 'blink brawler bush canopener deadeye drone healer ram ranger recall seeker sentinel slow sonar stealth vanguard vtol wall'.split(' ');
const AMMO = 'abilityresource gargantuan highaccuracy highexplosive leech mobility momentum silenced spotting standard unstable'.split(' ');
const COMPONENTS = 'adaptivehardening agitator bulkheads camoweb cascadegate catalyticreservoir coreamp corebooster coreinjector densifier driftsparker duplicator energyexpander energyvent extendedgearing fabricator frictioncapacitor hotchamber hullbellows kineticabsorber microplating modulesurger momentumimparter overflowshunt phasemodule powerconverter propagationdrive quickslot reactivemodules redirectorgear relentlessadapter repairmechanism senseoverdrive sensitivesights shellcharger shellstabilizer shiftcloak sidescrapegear signatureobscurer stablerangefinder synchronizer vulnbreaker weaknessanalyzer'.split(' ');

function base64url(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text) {
  if (!/^[\w-]+$/.test(text)) throw new Error('Invalid share link');
  return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4)), (char) => char.charCodeAt(0));
}

function token(list, id) {
  const value = list.indexOf(id);
  if (value < 0) throw new Error(`Cannot share unknown item: ${id}`);
  return value;
}

export function encodeShare(selection, title = '') {
  const allocations = Object.entries(selection.talentPoints).filter(([, points]) => points > 0);
  const titleBytes = new TextEncoder().encode(title);
  const bytes = new Uint8Array(8 + allocations.length + titleBytes.length);
  bytes[0] = 1;
  bytes[1] = token(VEHICLES, selection.vehicleId);
  const ammo = selection.ammoIds.reduce((value, id, slot) => value | token(AMMO, id) << (slot * 4), 0) | selection.previewAmmoSlot << 12;
  bytes[2] = ammo & 255;
  bytes[3] = ammo >> 8;
  const components = selection.componentIds.reduce((value, id, slot) => value | (id ? token(COMPONENTS, id) + 1 : 0) << (slot * 6), 0);
  bytes[4] = components & 255;
  bytes[5] = components >> 8 & 255;
  bytes[6] = components >> 16;
  bytes[7] = allocations.length;
  for (let i = 0; i < allocations.length; i++) {
    const [id, points] = allocations[i];
    const match = id.match(/^(.+)-talent(\d{3})$/);
    const number = Number(match?.[2]);
    if (match?.[1] !== selection.vehicleId || number < 1 || number > 31 || !Number.isInteger(points) || points > 7) throw new Error('Unsupported talent allocation');
    bytes[8 + i] = number << 3 | points;
  }
  bytes.set(titleBytes, 8 + allocations.length);
  return base64url(bytes);
}

export function decodeShare(text) {
  const bytes = fromBase64url(text);
  if (bytes.length < 8 || bytes[0] !== 1 || !VEHICLES[bytes[1]] || bytes[3] >> 6 || bytes[6] >> 2 || bytes.length < 8 + bytes[7]) throw new Error('Unsupported share link');
  const vehicleId = VEHICLES[bytes[1]];
  const ammo = bytes[2] | bytes[3] << 8;
  const components = bytes[4] | bytes[5] << 8 | bytes[6] << 16;
  const ammoIds = Array.from({ length: 3 }, (_, slot) => AMMO[ammo >> (slot * 4) & 15]);
  const componentIds = Array.from({ length: 3 }, (_, slot) => {
    const value = components >> (slot * 6) & 63;
    return value ? COMPONENTS[value - 1] : '';
  });
  const previewAmmoSlot = ammo >> 12;
  if (ammoIds.some((id) => !id) || componentIds.some((id) => id === undefined) || previewAmmoSlot > 2) throw new Error('Invalid share loadout');
  const talentPoints = {};
  for (const value of bytes.subarray(8, 8 + bytes[7])) {
    const number = value >> 3;
    const points = value & 7;
    const id = `${vehicleId}-talent${String(number).padStart(3, '0')}`;
    if (!number || !points || id in talentPoints) throw new Error('Invalid shared talent');
    talentPoints[id] = points;
  }
  return {
    t: new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(8 + bytes[7])),
    sel: { vehicleId, ammoIds, componentIds, talentPoints, previewAmmoSlot },
  };
}

export function gameLoadoutBytes(index, selection, title = '') {
  const vehicle = index.vehicleById.get(selection.vehicleId);
  const tree = index.talentTreeById.get(selection.vehicleId);
  if (!vehicle || !tree) throw new Error('Unknown game vehicle');
  const name = title.trim() || `${vehicle.name} Build`;
  const chunks = [];
  let length = 0;
  const append = (bytes) => { chunks.push(bytes); length += bytes.length; };
  const int32 = (value) => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setInt32(0, value, true);
    append(bytes);
  };
  const string = (value) => {
    if (!value) { int32(0); return; }
    if (/[^\x00-\x7f]/.test(value)) {
      int32(-(value.length + 1));
      const bytes = new Uint8Array((value.length + 1) * 2);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < value.length; i++) view.setUint16(i * 2, value.charCodeAt(i), true);
      append(bytes);
    } else {
      const bytes = new TextEncoder().encode(value + '\0');
      int32(bytes.length);
      append(bytes);
    }
  };
  const tags = (values) => { int32(values.length); values.forEach(string); };
  const key = (map, id) => {
    const item = map.get(id);
    if (!item) throw new Error(`Unknown game item: ${id}`);
    return item.key;
  };
  string(vehicle.key);
  tags(selection.componentIds.map((id) => id ? key(index.componentById, id) : ''));
  tags(selection.ammoIds.slice(1).map((id) => key(index.ammoById, id)));
  int32(0);
  string(name);
  string(vehicle.key);
  string(name);
  int32(tree.version);
  const allocations = tree.nodes.filter((node) => selection.talentPoints[node.talentId] > 0);
  int32(allocations.length);
  for (const node of allocations) {
    string(key(index.talentById, node.talentId));
    int32(selection.talentPoints[node.talentId]);
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

export async function encodeGameCode(index, selection, title = '') {
  const bytes = gameLoadoutBytes(index, selection, title);
  const compressed = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const output = new Uint8Array(4 + compressed.length);
  new DataView(output.buffer).setInt32(0, bytes.length, true);
  output.set(compressed, 4);
  return 'TYR01_' + base64url(output);
}

const GAME_PREFIX = 'TYR01_';
const GAME_MAX_BYTES = 1 << 20;
const GAME_MAX_COUNT = 1024;
const GAME_ERROR = 'Invalid game code';

function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

async function inflateBounded(bytes, expected) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const output = new Uint8Array(expected);
  let total = 0;
  let oversize = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.length > expected) {
        oversize = true;
        await reader.cancel();
        break;
      }
      output.set(value, total);
      total += value.length;
    }
  } catch {
    throw new Error(`${GAME_ERROR}: data is corrupt or truncated`);
  }
  if (oversize) throw new Error(`${GAME_ERROR}: data is larger than its declared size of ${expected} bytes`);
  if (total !== expected) throw new Error(`${GAME_ERROR}: data is ${total} bytes but declares ${expected}`);
  const tail = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(bytes.length - 4);
  if (tail !== adler32(output)) throw new Error(`${GAME_ERROR}: compressed stream is truncated or has trailing bytes`);
  return output;
}

class GameReader {
  constructor(bytes) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.bytes = bytes;
    this.offset = 0;
  }
  int32() {
    if (this.bytes.length - this.offset < 4) throw new Error(`${GAME_ERROR}: data ends unexpectedly`);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }
  count(minBytes) {
    const value = this.int32();
    if (value < 0 || value > GAME_MAX_COUNT || value * minBytes > this.bytes.length - this.offset) throw new Error(`${GAME_ERROR}: bad entry count ${value}`);
    return value;
  }
  string() {
    const size = this.int32();
    if (!size) return '';
    const width = size < 0 ? 2 : 1;
    const units = Math.abs(size);
    if (size === -2147483648 || units * width > this.bytes.length - this.offset) throw new Error(`${GAME_ERROR}: bad string length ${size}`);
    const start = this.offset;
    this.offset += units * width;
    let text = '';
    for (let i = 0; i < units - 1; i++) {
      text += String.fromCharCode(width === 2 ? this.view.getUint16(start + i * 2, true) : this.bytes[start + i]);
    }
    const last = width === 2 ? this.view.getUint16(start + (units - 1) * 2, true) : this.bytes[start + units - 1];
    if (last !== 0) throw new Error(`${GAME_ERROR}: string is not NUL-terminated`);
    return text;
  }
  tags(minBytes = 4) {
    return Array.from({ length: this.count(minBytes) }, () => this.string());
  }
}

export async function decodeGameCode(index, code) {
  const text = String(code ?? '').trim();
  if (!text.startsWith(GAME_PREFIX)) throw new Error(`${GAME_ERROR}: expected a code starting with ${GAME_PREFIX}`);
  const body = text.slice(GAME_PREFIX.length);
  if (!/^[\w-]+$/.test(body) || body.length % 4 === 1 || body.length > GAME_MAX_BYTES * 2) throw new Error(`${GAME_ERROR}: not valid base64url`);
  const packed = fromBase64url(body);
  if (packed.length < 4 + 2 + 4) throw new Error(`${GAME_ERROR}: code is too short`);
  const expected = new DataView(packed.buffer).getInt32(0, true);
  if (expected < 1 || expected > GAME_MAX_BYTES) throw new Error(`${GAME_ERROR}: declared size ${expected} is outside 1..${GAME_MAX_BYTES}`);
  const reader = new GameReader(await inflateBounded(packed.subarray(4), expected));
  const warnings = [];

  const vehicleTag = reader.string();
  const vehicle = index.vehicles.find((entry) => entry.key === vehicleTag);
  if (!vehicle) throw new Error(`Unknown vehicle in game code: ${vehicleTag || '(empty)'}`);
  const componentTags = reader.tags();
  const ammoTags = reader.tags();
  reader.int32();
  const loadoutName = reader.string();
  const treeVehicleTag = reader.string();
  const treeName = reader.string();
  const treeVersion = reader.int32();
  const allocations = Array.from({ length: reader.count(8) }, () => [reader.string(), reader.int32()]);
  if (reader.offset !== reader.bytes.length) throw new Error(`${GAME_ERROR}: ${reader.bytes.length - reader.offset} unexpected trailing bytes`);
  if (treeVehicleTag !== vehicleTag) throw new Error(`${GAME_ERROR}: talent tree is for ${treeVehicleTag || '(empty)'} but loadout is ${vehicleTag}`);
  const tree = index.talentTreeById.get(vehicle.id);
  if (!tree) throw new Error(`No talent tree for vehicle ${vehicle.name}`);
  if (treeVersion !== tree.version) warnings.push(`Talent tree version ${treeVersion} differs from the current ${tree.version}`);

  const defaults = getDefaultSelection(index, vehicle.id);
  const ammoIds = [...defaults.ammoIds];
  if (ammoTags.length !== 2 && ammoTags.length !== 3) throw new Error(`${GAME_ERROR}: expected 2 or 3 ammo entries, found ${ammoTags.length}`);
  const secondary = ammoTags.length === 3 ? ammoTags.slice(1) : ammoTags;
  secondary.forEach((tag, offset) => {
    const slot = offset + 1;
    if (!tag) return;
    const ammo = index.ammo.find((entry) => entry.key === tag);
    if (!ammo) warnings.push(`Unknown ammo ${tag}; using ${ammoIds[slot]} in slot ${slot + 1}`);
    else if (!ammo.selectable || (slot === 1 && ammo.id !== 'standard' && !ammo.canLoadSecondary)) warnings.push(`${ammo.displayName} cannot be loaded in slot ${slot + 1}; using ${ammoIds[slot]}`);
    else ammoIds[slot] = ammo.id;
  });

  const slotCount = vehicle.loadout.componentSlotCount;
  const componentIds = Array(slotCount).fill('');
  const seen = new Set();
  componentTags.forEach((tag, slot) => {
    if (!tag) return;
    const component = index.components.find((entry) => entry.key === tag);
    if (!component) { warnings.push(`Unknown component ${tag}; slot ${slot + 1} left empty`); return; }
    if (seen.has(component.id)) throw new Error(`${GAME_ERROR}: duplicate component ${component.name}`);
    seen.add(component.id);
    if (slot >= slotCount) warnings.push(`${component.name} is in slot ${slot + 1} but ${vehicle.name} has ${slotCount} slots; dropped`);
    else componentIds[slot] = component.id;
  });

  const nodeIds = new Set(tree.nodes.map((node) => node.talentId));
  const talentPoints = {};
  for (const [tag, raw] of allocations) {
    const talent = [...index.talentById.values()].find((entry) => entry.key === tag);
    if (!talent) { warnings.push(`Unknown talent ${tag}; ignored`); continue; }
    if (!nodeIds.has(talent.id)) { warnings.push(`Talent ${tag} does not belong to ${vehicle.name}; ignored`); continue; }
    if (raw < 1) { warnings.push(`Talent ${talent.name} has ${raw} points; ignored`); continue; }
    if (talent.id in talentPoints) warnings.push(`Talent ${talent.name} appears more than once; using the last entry`);
    if (raw > talent.maxPoints) warnings.push(`Talent ${talent.name} has ${raw} points; clamped to ${talent.maxPoints}`);
    talentPoints[talent.id] = Math.min(raw, talent.maxPoints);
  }

  return {
    selection: { vehicleId: vehicle.id, ammoIds, componentIds, talentPoints, previewAmmoSlot: defaults.previewAmmoSlot },
    name: loadoutName || treeName,
    warnings,
  };
}
