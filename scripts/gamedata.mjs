// Loads the game data bundle from the GameData submodule (Stoke Games' official export) in the shape
// the planner uses. Shared by the build and the checks.
import fs from 'node:fs';
import path from 'node:path';
import { fillTalentDescription } from '../site/vendor/tyrhq-engine.js';

// Balance changes from Steam patch notes that GameData has not exported yet. Each applies only while
// the export is at or below `upTo`, so a newer GameData replaces it without anyone removing it here.
const PATCHES = [
  {
    name: '11/9/26 balance patch',
    upTo: 37952,
    apply(bundle) {
      bundle.components.find((c) => c.id === 'hullbellows').pointValues = [95];
      bundle.vehicles.find((v) => v.slug === 'parallax').stats.ShellPenetration = 70;
      const valor = bundle.vehicles.find((v) => v.slug === 'valor').ability;
      valor.description = valor.description.replace('150% of base Shell Damage', '160% of base Shell Damage');
    },
  },
];

export function loadBundle(root) {
  const file = path.join(root, 'GameData', 'generated', 'runtime.json');
  if (!fs.existsSync(file)) throw new Error(`${file} is missing: run git submodule update --init`);
  const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete bundle.maps; // not used by the planner
  const changelist = bundle.metadata?.sourceChangelist ?? 0;
  bundle.metadata.patches = PATCHES.filter((p) => changelist <= p.upTo).map((p) => (p.apply(bundle), p.name));
  // GameData ships component descriptions with a "value" placeholder; fill in the numbers once here,
  // the same way the talent tree does at render time (components have a single level).
  for (const c of bundle.components) {
    c.description = fillTalentDescription(c.description ?? '', c.pointValues ?? [], c.valueTokens ?? [], 1, 1);
  }
  return bundle;
}
