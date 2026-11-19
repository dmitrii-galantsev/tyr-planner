const layout = [
  [null, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15],
  [null, 18, 19, 20],
  [null, 22, 23, 24],
  [null, 26, 27],
];
const id = 'terrapin';
const talentId = (n) => `${id}-talent${String(n).padStart(3, '0')}`;
const shellReloadPath = '/TyrVehicleTerrapin/Ability/GE_TurtleShellReloadKeystone.GE_TurtleShellReloadKeystone_C';

export function addTerrapin(bundle, client) {
  const key = 'Gameplay.Vehicle.Terrapin';
  if (bundle.vehicles.some((v) => v.key === key)) return;
  const stats = client.tanks[key];
  const talents = client.terrapinTalents;
  const shellReload = { id: 'terrapin-shelled-reload', path: shellReloadPath, modifiers: [{ attribute: 'ReloadTime', op: 'MultiplyAdditive' }] };
  const effectsByPath = new Map(bundle.effects.map((e) => [e.path.toLowerCase(), e]));
  const byNumber = new Map(talents.map((t) => [Number(t.key.split('Talent').at(-1)), t]));
  const nodes = layout.flatMap((rows, tier) => rows.flatMap((number, row) => {
    if (!number) return [];
    const talent = byNumber.get(number);
    if (!talent) throw new Error(`Missing Terrapin talent ${number}`);
    const bindings = talent.effects.filter((e) => e.path).map(({ event, path }) => {
      const effect = effectsByPath.get(path.toLowerCase());
      if (!effect) throw new Error(`Missing Terrapin effect ${path}`);
      return { eventTag: event, effectPath: path, effectId: effect.id };
    });
    if (number === 26) bindings.push({ eventTag: 'Armored Shell active at reload start', effectPath: shellReloadPath, effectId: shellReload.id });
    const pointValues = number === 6 ? talent.pointValues.slice(0, 2) : talent.pointValues;
    const maxPoints = pointValues.length;
    const nodeId = talentId(number);
    bundle.talents.push({ ...talent, id: nodeId, pointValues, maxPoints, supplementalDescription: talent.supplement,
      effectIds: bindings.map((b) => b.effectId), eventTags: bindings.map((b) => b.eventTag), effectBindings: bindings });
    return [{ talentId: nodeId, tier, row, maxPoints, isKeystone: tier === 6, prerequisiteIds: number === 7 ? [talentId(3)] : [] }];
  }));
  if (nodes.length !== talents.length) throw new Error('Terrapin tree and talent definitions disagree');
  bundle.effects.push(shellReload);
  bundle.talentTrees.push({ id, vehicleId: id, name: 'Terrapin', version: 37081, nodes, talentCount: nodes.length });
  bundle.vehicles.push({ id, key, slug: id, name: 'Terrapin', classId: 'heavy', classLabel: 'Heavy',
    isWorkInProgress: true, selectable: true, weightKg: stats.Mass, stats,
    ability: { name: 'Armored Shell', description: 'Deploys extra armor. It can be cancelled or broken by three blocked shots.' },
    loadout: { componentSlotCount: 3, ammoSlotCount: 3, defaultAmmoIds: ['standard', 'standard', 'standard'], previewAmmoSlot: 0, talentTreeId: id },
    nativeComponents: [],
  });
}
