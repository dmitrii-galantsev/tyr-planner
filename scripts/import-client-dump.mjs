import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').trim());

export function readTankDump(dir) {
  const files = fs.readdirSync(dir, { recursive: true }).filter((file) => path.basename(file) === 'DT_TankData.json').sort();
  if (!files.length) throw new Error(`No exported DT_TankData.json files in ${dir}`);
  const rows = new Map();
  for (const file of files) {
    for (const table of readJson(path.join(dir, file))) {
      for (const [key, row] of Object.entries(table.Rows)) {
        if (rows.has(key)) throw new Error(`Duplicate exported tank row: ${key} (${file})`);
        rows.set(key, row);
      }
    }
  }
  return rows;
}

function readTalents(file) {
  const talents = [];
  for (const table of readJson(file)) {
    for (const [key, row] of Object.entries(table.Rows).sort(([a], [b]) => a.localeCompare(b))) {
      const name = row.TalentName?.SourceString;
      const pointValues = row.TalentPointValues;
      const template = row.TalentDescription?.SourceString;
      if (!key.startsWith('Gameplay.TalentTree.Terrapin.') || !name || !template || !pointValues?.length || !pointValues.every(Number.isFinite)) {
        throw new Error(`Incomplete or unexpected Terrapin talent: ${key}`);
      }
      const valueTokens = [];
      const description = template.replace(/\{(\w+)\}/g, (_, token) => (valueTokens.push(token), 'value'));
      talents.push({ key, name, description, valueTokens, pointValues, supplement: row.TalentSupplementalDescription?.SourceString || '',
        effects: (row.EventEffectPairs ?? []).map(({ EventTag, TalentGameplayEffect }) => ({ event: EventTag.TagName, path: TalentGameplayEffect.AssetPathName || null })),
      });
    }
  }
  if (talents.length === 0 || new Set(talents.map(({ key }) => key)).size !== talents.length) throw new Error('Missing or duplicate Terrapin talent rows');
  return talents;
}

function main(args) {
  const usage = `Usage: node scripts/import-client-dump.mjs --cl <changelist> --tanks <exported-json-directory> --talents <Terrapin-DT_TalentTreeData.json>
Writes a planner snapshot to stdout. Inputs must already be decoded JSON from the same build.

Example: node scripts/import-client-dump.mjs --cl 39928 --tanks /tmp/tyr-export/json --talents /tmp/tyr-export/TerrapinTalents.json`;
  if (args.includes('--help')) return console.log(usage);
  const [clFlag, cl, tanksFlag, tankDir, talentsFlag, talentFile] = args;
  const changelist = Number(cl);
  if (args.length !== 6 || clFlag !== '--cl' || tanksFlag !== '--tanks' || talentsFlag !== '--talents' || !Number.isSafeInteger(changelist) || changelist <= 0) {
    console.error(usage);
    process.exitCode = 2;
    return;
  }
  const raw = readTankDump(tankDir);
  const tanks = Object.fromEntries([...raw].sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, row]) => {
    if (key === 'Gameplay.Vehicle.Base' || key === 'Gameplay.Vehicle.SpectatorTank') return [];
    const stats = Object.fromEntries(Object.entries(row).filter(([, value]) => Number.isFinite(value)));
    if (!(stats.MaxHealth > 0 && stats.ReloadTime > 0)) throw new Error(`Missing stock stats for ${key}`);
    return [[key, stats]];
  }));
  if (!tanks['Gameplay.Vehicle.Terrapin']) throw new Error('Terrapin stock row not found');
  console.log(JSON.stringify({ changelist, tanks, terrapinTalents: readTalents(talentFile) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2));
