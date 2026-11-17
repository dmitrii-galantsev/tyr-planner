import fs from 'node:fs';
import path from 'node:path';
import { fillTalentDescription } from '../site/vendor/tyrhq-engine.js';

function setFrom(obj, key, from, to) {
  if (JSON.stringify(obj[key]) !== JSON.stringify(from)) throw new Error(`patch overlay: ${key} is ${JSON.stringify(obj[key])}, expected ${JSON.stringify(from)}`);
  obj[key] = to;
}

const PATCHES = [
  {
    name: '11/9/26 balance patch',
    upTo: 37952,
    apply(bundle) {
      setFrom(bundle.components.find((c) => c.id === 'hullbellows'), 'pointValues', [85], [95]);
      setFrom(bundle.vehicles.find((v) => v.slug === 'parallax').stats, 'ShellPenetration', 80, 70);
      const valor = bundle.vehicles.find((v) => v.slug === 'valor').ability;
      if (!valor.description.includes('150% of base Shell Damage')) throw new Error(`patch overlay: Valor heal text is "${valor.description}"`);
      valor.description = valor.description.replace('150% of base Shell Damage', '160% of base Shell Damage');
    },
  },
];

export function loadBundle(root) {
  const file = path.join(root, 'GameData', 'generated', 'runtime.json');
  if (!fs.existsSync(file)) throw new Error(`${file} is missing: run git submodule update --init`);
  const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete bundle.maps;
  const changelist = bundle.metadata?.sourceChangelist ?? 0;
  bundle.metadata.patches = PATCHES.filter((p) => changelist <= p.upTo).map((p) => (p.apply(bundle), p.name));
  for (const c of bundle.components) {
    c.description = fillTalentDescription(c.description ?? '', c.pointValues ?? [], c.valueTokens ?? [], 1, 1);
  }
  return bundle;
}
