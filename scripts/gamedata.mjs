import fs from 'node:fs';
import path from 'node:path';
import { fillTalentDescription } from '../site/vendor/tyrhq-engine.js';
import { addTerrapin } from './terrapin.mjs';

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
      const valor = bundle.vehicles.find((v) => v.slug === 'valor').ability;
      if (!valor.description.includes('150% of base Shell Damage')) throw new Error(`patch overlay: Valor heal text is "${valor.description}"`);
      valor.description = valor.description.replace('150% of base Shell Damage', '160% of base Shell Damage');
    },
  },
  {
    name: '11/19/26 balance patch',
    upTo: 37952,
    source: 'https://store.steampowered.com/news/app/2445260/view/678515671123886389',
    apply(bundle) {
      const component = (id) => bundle.components.find((c) => c.id === id);
      bundle.vehicles.find((v) => v.slug === 'seeker').ability.description += ' The November 19 patch increased the droid’s flight speed by 50% and fixed its ability to spot stealthed Phantoms.';

      setFrom(component('weaknessanalyzer'), 'pointValues', [1], [1.5]);
      const hardening = component('adaptivehardening');
      const hardeningText = 'Reduces Damage Taken while spotted, reaching the 12% cap after 40 seconds. Resets on going unspotted.';
      setFrom(hardening, 'description', 'Reduces Damage Taken by value each second you are spotted. Maxes out at 12% and resets on going unspotted.', hardeningText);
      setFrom(hardening, 'descriptionTemplate', 'Reduces Damage Taken by {LevelValuePercent} each second you are spotted. Maxes out at 12% and resets on going unspotted.', hardeningText);
      const fabricator = component('fabricator');
      setFrom(fabricator, 'description', 'Generates value Secondary and Tertiary Shells every 60 seconds', 'Generates value Tertiary Shells every 60 seconds');
      setFrom(fabricator, 'descriptionTemplate', 'Generates {LevelValue} Secondary and Tertiary Shells every 60 seconds', 'Generates {LevelValue} Tertiary Shells every 60 seconds');
      const duplicator = component('duplicator');
      const oldText = 'Increases base Shell Damage by <bold>5 and <bold>Doubles the number of shells gained from all sources';
      const newText = 'Increases base Shell Damage by 5 and doubles Secondary Shells gained from all sources.';
      setFrom(duplicator, 'description', oldText, newText);
      setFrom(duplicator, 'descriptionTemplate', oldText, newText);
      const shellGain = bundle.effects.find((e) => e.id === 'ge-components-shellgainpercent-ge-components-shellgainpercent');
      const attributes = shellGain.modifiers.map((m) => m.attribute);
      const expected = ['CaptureZoneShellsGainedMultiplier', 'StartingSecondaryShellsCount', 'StartingTertiaryShellsCount'];
      if (attributes.join(',') !== expected.join(',')) throw new Error(`patch overlay: Duplicator modifiers are ${attributes}, expected ${expected}`);
      shellGain.modifiers = shellGain.modifiers.filter((m) => m.attribute === 'StartingSecondaryShellsCount');
    },
  },
];

export function loadBundle(root) {
  const file = path.join(root, 'GameData', 'generated', 'runtime.json');
  if (!fs.existsSync(file)) throw new Error(`${file} is missing: run git submodule update --init`);
  const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete bundle.maps;
  const changelist = bundle.metadata?.sourceChangelist ?? 0;
  const patches = PATCHES.filter((p) => changelist <= p.upTo);
  bundle.metadata.patches = patches.map((p) => (p.apply(bundle), p.name));
  bundle.metadata.patchSource = patches.at(-1)?.source ?? null;
  const client = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'snapshots', 'client-39928.json'), 'utf8'));
  if (changelist < client.changelist) {
    for (const v of bundle.vehicles) {
      const stock = client.tanks[v.key];
      if (!stock) continue;
      for (const [key, value] of Object.entries(stock)) {
        if (typeof v.stats[key] === 'number') v.stats[key] = value;
      }
    }
    bundle.metadata.clientStockChangelist = client.changelist;
  }
  addTerrapin(bundle, client);
  for (const c of bundle.components) {
    c.description = fillTalentDescription(c.description ?? '', c.pointValues ?? [], c.valueTokens ?? [], 1, 1);
  }
  return bundle;
}
