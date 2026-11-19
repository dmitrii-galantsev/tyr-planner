// Line icons (24x24 stroke paths) used by the planner; data-icon="name" on a button gets one prepended.
const PATHS = {
  tanks: 'M2.5 14.5h19V18h-19z M7 14.5V11h7.5l2.5 3.5 M14.5 11H21 M5.5 18v1.5 M18.5 18v1.5',
  talents: 'M12 3v5 M12 8H6v6 M12 8h6v6 M6 14v6 M18 14v6 M4 20h4 M16 20h4',
  search: 'M10.5 4.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M15 15l5 5',
  plus: 'M12 5v14 M5 12h14',
  bookmark: 'M7 4.5h10v15l-5-3.5-5 3.5z',
  link: 'M9.5 14.5l5-5 M8.5 10.5L7 12a3.5 3.5 0 0 0 5 5l1.5-1.5 M15.5 13.5L17 12a3.5 3.5 0 0 0-5-5l-1.5 1.5',
  star: 'M12 3.5l2.7 5.7 6.3.8-4.6 4.3 1.2 6.2-5.6-3.1-5.6 3.1 1.2-6.2L3 10l6.3-.8z',
  check: 'M4 12.5l5.5 5.5L20 6.5',
  lock: 'M5.5 11h13v9.5h-13z M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  warning: 'M12 3.5l9 16h-18z M12 9v4.5 M12 17v.1',
  light: 'M12 3l9 9-9 9-9-9z',
  medium: 'M12 3l9 9-9 9-9-9z M7.5 7.5l9 9',
  heavy: 'M12 3l9 9-9 9-9-9z M6 9l9 9 M9 6l9 9',
  wand: 'M4 20l9-9 M14 3.5l1.6 3.4 3.4 1.6-3.4 1.6L14 13.5l-1.6-3.4L9 8.5l3.4-1.6z',
  reset: 'M4.5 12a7.5 7.5 0 1 0 2.4-5.5 M4.5 3.5v4h4',
  trash: 'M4.5 6.5h15 M9 6.5V3.5h6v3 M6.5 6.5l1 14h9l1-14 M10 10v7 M14 10v7',
  export: 'M12 15V3.5 M8 7.5l4-4 4 4 M4.5 13.5v7h15v-7',
  import: 'M12 3.5V15 M8 11l4 4 4-4 M4.5 13.5v7h15v-7',
  x: 'M6 6l12 12 M18 6L6 18',
  edit: 'M4.5 19.5l1-4.5L16 4.5l3.5 3.5L9 18.5z M13.5 7l3.5 3.5',
  dot: 'M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
};

const NS = 'http://www.w3.org/2000/svg';

export function icon(name) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('ico');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', PATHS[name] || PATHS.dot);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.7');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

export function decorate(root = document) {
  for (const node of root.querySelectorAll('[data-icon]')) {
    if (node.querySelector(':scope > .ico')) continue;
    node.prepend(icon(node.dataset.icon));
  }
}
