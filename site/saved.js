export const SAVED_KEY = 'tyrhq.saved';
export const MAX_SAVED = 40;

export const titleKey = (title) => String(title ?? '').trim();

export function selectionKey(sel) {
  const points = Object.entries(sel?.talentPoints ?? {})
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([sel?.vehicleId ?? '', sel?.ammoIds ?? [], sel?.componentIds ?? [], points, sel?.previewAmmoSlot ?? 0]);
}

export function parseSaved(text) {
  let raw;
  try {
    raw = JSON.parse(text || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => s?.sel && typeof s.sel === 'object').map((s) => {
    const entry = { title: titleKey(s.title), sel: s.sel };
    if (Number.isFinite(s.at) && s.at > 0) entry.at = s.at;
    return entry;
  });
}

export function readSaved(storage) {
  try {
    return parseSaved((storage ?? globalThis.localStorage).getItem(SAVED_KEY));
  } catch {
    return null;
  }
}

export function writeSaved(list, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(SAVED_KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
    return true;
  } catch {
    return false;
  }
}

export function findSaved(list, title) {
  const key = titleKey(title);
  return list.findIndex((s) => titleKey(s.title) === key);
}

export function snapshotName(list, base, isSame = () => false) {
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base} ${n}`;
    const at = findSaved(list, name);
    if (at < 0 || isSame(list[at])) return name;
  }
}

export function putSaved(list, entry) {
  const at = findSaved(list, entry.title);
  const next = [entry, ...list.filter((_, i) => i !== at)];
  return { list: next.slice(0, MAX_SAVED), replaced: at < 0 ? null : list[at], dropped: next.slice(MAX_SAVED) };
}

export function renameSaved(list, from, to) {
  const at = findSaved(list, from);
  const clash = findSaved(list, to);
  if (at < 0 || (clash >= 0 && clash !== at)) return null;
  return list.map((s, i) => (i === at ? { ...s, title: to } : s));
}

export function removeSaved(list, title) {
  const at = findSaved(list, title);
  return list.filter((_, i) => i !== at);
}
