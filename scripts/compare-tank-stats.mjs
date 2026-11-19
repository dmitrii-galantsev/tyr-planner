import path from 'node:path';
import { loadBundle } from './gamedata.mjs';
import { readTankDump } from './import-client-dump.mjs';

const usage = `Usage: node scripts/compare-tank-stats.mjs <exported-json-directory>
Compares the patched planner with numeric fields from exported DT_TankData.json files.
Reports differences, missing planner tanks and client-only vehicles; changes no files.

Example: node scripts/compare-tank-stats.mjs /tmp/tyr-export/json`;
const [dir, ...extra] = process.argv.slice(2);
if (dir === '--help') {
  console.log(usage);
  process.exit(0);
}
if (!dir || extra.length) {
  console.error(usage);
  process.exit(2);
}

const rows = readTankDump(dir);

const bundle = loadBundle(path.resolve(import.meta.dirname, '..'));
const vehicles = bundle.vehicles;
let compared = 0;
let differences = 0;
let matched = 0;
for (const { key, name, stats } of vehicles) {
  const row = rows.get(key);
  if (!row) {
    console.log(`Missing from client export: ${key}`);
    continue;
  }
  matched++;
  rows.delete(key);
  for (const [field, client] of Object.entries(row)) {
    const planner = stats[field];
    if (!Number.isFinite(client) || !Number.isFinite(planner)) continue;
    compared++;
    if (Math.abs(planner - client) > 0.001) {
      differences++;
      console.log(`${name} ${field}: planner ${planner}, client ${client}`);
    }
  }
}
for (const [key, row] of rows) {
  if (['HeavyTank', 'MediumTank', 'LightTank'].includes(row.VehicleClass) && !key.endsWith('.Base') && !key.endsWith('.SpectatorTank')) {
    console.log(`Client-only vehicle: ${key}`);
  }
}
console.log(`${matched}/${vehicles.length} site stock rows matched; ${compared} shared numeric fields compared; ${differences} differences.`);
if (matched !== vehicles.length || !compared || differences) process.exitCode = 1;
