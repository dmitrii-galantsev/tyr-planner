// Loads the game data bundle from the GameData submodule (Stoke Games' official export) in the shape
// the planner uses. Shared by the build and the checks.
import fs from 'node:fs';
import path from 'node:path';
import { fillTalentDescription } from '../site/vendor/tyrhq-engine.js';

export function loadBundle(root) {
  const file = path.join(root, 'GameData', 'generated', 'runtime.json');
  if (!fs.existsSync(file)) throw new Error(`${file} is missing: run git submodule update --init`);
  const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete bundle.maps; // not used by the planner
  // GameData ships component descriptions with a "value" placeholder; fill in the numbers once here,
  // the same way the talent tree does at render time (components have a single level).
  for (const c of bundle.components) {
    c.description = fillTalentDescription(c.description ?? '', c.pointValues ?? [], c.valueTokens ?? [], 1, 1);
  }
  return bundle;
}
