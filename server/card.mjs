// Renders the 1200x630 build card used as the link-preview image (og:image).
// Colours are the ones measured from Tyr's own UI (see site/tyr.css).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['BarlowCondensed_700Bold', 'BarlowCondensed_600SemiBold', 'JetBrainsMono_500Medium', 'JetBrainsMono_700Bold', 'Inter_500Medium', 'Inter_600SemiBold', 'Inter_700Bold']) {
  GlobalFonts.registerFromPath(path.join(HERE, 'fonts', `${f}.ttf`));
}

export const W = 1200;
export const H = 630;
const C = {
  bg: '#131820', ink: '#13132a', paper: '#e8e8ff', fg: '#e8eeff', fg2: '#c3c9e0', dim: '#a4abc6', faint: '#757b90',
  line: '#313745', strip: '#1c2334', stripEdge: '#bfc7de', tile: '#1b2233', tileEdge: '#2d3445', tileIcon: '#606779',
  lilac: '#878fbe', lilacEdge: '#9ca4ca', notch: '#0ef6c8', amber: '#d8a468', amberDot: '#b9864a', cyan: '#99f8ff',
  good: '#6fdc9c', bad: '#f07f88', alpha: '#f88431', slot: '#2f364b', slotEdge: '#4a5170',
  light: '#8fbbe6', medium: '#dcc27f', heavy: '#e3a08a',
};
const F = {
  cond: (w, s) => `${w} ${s}px "Barlow Condensed"`,
  mono: (w, s) => `${w} ${s}px "JetBrains Mono"`,
  sans: (w, s) => `${w} ${s}px "Inter"`,
};

const imageCache = new Map();
async function img(file) {
  if (!imageCache.has(file)) imageCache.set(file, loadImage(file).catch(() => null));
  return imageCache.get(file);
}

// talent icons are greyscale masks (the site tints them in CSS); tint once per colour and cache
const tintCache = new Map();
async function tinted(file, color, size) {
  const key = `${file}|${color}|${size}`;
  if (tintCache.has(key)) return tintCache.get(key);
  const src = await img(file);
  if (!src) return null;
  const c = createCanvas(size, size);
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0, size, size);
  const d = x.getImageData(0, 0, size, size);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  for (let i = 0; i < d.data.length; i += 4) {
    const lum = d.data[i];
    d.data[i] = r; d.data[i + 1] = g; d.data[i + 2] = b; d.data[i + 3] = lum;
  }
  x.putImageData(d, 0, 0);
  if (tintCache.size > 4000) tintCache.clear();
  tintCache.set(key, c);
  return c;
}

function spaced(ctx, text, x, y, spacing) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return cx - spacing;
}
const spacedWidth = (ctx, text, spacing) => [...text].reduce((w, ch) => w + ctx.measureText(ch).width + spacing, 0) - spacing;
// shrink a letter-spaced label until it fits (labels are short; never truncate them)
function fitSpaced(ctx, text, max, weight, size, spacing) {
  let s = size;
  ctx.font = F.mono(weight, s);
  while (s > 8 && spacedWidth(ctx, text, spacing) > max) ctx.font = F.mono(weight, --s);
}

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

function panel(ctx, x, y, w, h, label) {
  ctx.fillStyle = 'rgba(17,22,32,0.72)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = C.stripEdge;
  ctx.fillRect(x, y, 26, 2);
  if (label) {
    ctx.fillStyle = C.dim;
    ctx.font = F.mono(700, 14);
    spaced(ctx, label, x + 18, y + 30, 3);
  }
}

function chamferPath(ctx, x, y, w, h, cut) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

export async function renderCard(site, b) {
  const dir = site.siteDir;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const v = b.v;
  const classColor = C[v.classId] ?? C.fg2;

  // ---- garage backdrop (the same per-tank backdrop the planner shows), then shade for text ----
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const bd = await img(path.join(dir, 'images/backdrops', `${v.id}.webp`));
  if (bd) {
    const s = Math.max(W / bd.width, H / bd.height);
    ctx.drawImage(bd, (W - bd.width * s) / 2, (H - bd.height * s) / 2, bd.width * s, bd.height * s);
  }
  let g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(19,24,32,0.78)');
  g.addColorStop(0.55, 'rgba(19,24,32,0.25)');
  g.addColorStop(1, 'rgba(19,24,32,0.05)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, 4);

  // ---- tank render (Stoke Games GameData), top right ----
  const art = await img(path.join(dir, 'images/vehicles', `${v.id}-l.webp`));
  if (art) ctx.drawImage(art, 586, -8, 600, 300);

  // ---- header: class · ability, name, build title ----
  let x = 56;
  ctx.font = F.mono(700, 18);
  ctx.fillStyle = classColor;
  x = spaced(ctx, (v.classLabel ?? v.classId).toUpperCase(), x, 66, 4) + 14;
  ctx.fillStyle = C.faint;
  ctx.fillText('·', x, 66);
  x += 22;
  const ab = await img(path.join(dir, 'images/abilities', `${v.id}.webp`));
  if (ab) { ctx.drawImage(ab, x, 48, 44, 22); x += 52; }
  ctx.fillStyle = C.dim;
  spaced(ctx, (v.ability?.name ?? '').toUpperCase(), x, 66, 4);

  ctx.font = F.cond(700, 118);
  ctx.fillStyle = C.fg;
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 18;
  const name = v.name.toUpperCase();
  ctx.fillText(name, 50, 176);
  ctx.shadowBlur = 0;
  const nameW = ctx.measureText(name).width;
  if (v.isWorkInProgress) {
    ctx.font = F.mono(700, 15);
    const tw = spacedWidth(ctx, 'ALPHA', 3) + 16;
    ctx.fillStyle = C.alpha;
    ctx.fillRect(50 + nameW + 14, 98, tw, 26);
    ctx.fillStyle = '#1a0d02';
    spaced(ctx, 'ALPHA', 50 + nameW + 22, 117, 3);
  }
  ctx.font = F.mono(500, 24);
  const title = (b.title || 'Untitled build').toUpperCase();
  ctx.fillStyle = b.title ? C.fg2 : C.faint;
  spaced(ctx, fit(ctx, title, 500), 56, 218, 4);

  // ---- panels ----
  const top = 262;
  const ph = 330;
  // loadout
  panel(ctx, 40, top, 382, ph, 'COMPONENTS');
  for (let i = 0; i < 3; i++) {
    const c = b.components[i];
    const y = top + 46 + i * 62;
    if (!c) {
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = C.slotEdge;
      ctx.strokeRect(58.5, y + 0.5, 346, 51);
      ctx.setLineDash([]);
      ctx.fillStyle = C.faint;
      ctx.font = F.sans(500, 17);
      ctx.fillText(i < (v.loadout?.componentSlotCount ?? 3) ? 'Empty slot' : '—', 76, y + 32);
      continue;
    }
    ctx.fillStyle = C.slot;
    ctx.fillRect(58, y, 52, 52);
    ctx.strokeStyle = C.slotEdge;
    ctx.strokeRect(58.5, y + 0.5, 51, 51);
    const ci = await img(path.join(dir, 'images/components', `${c.id}.webp`));
    if (ci) ctx.drawImage(ci, 62, y + 4, 44, 44);
    ctx.fillStyle = C.fg;
    ctx.font = F.sans(600, 21);
    ctx.fillText(fit(ctx, c.name, 280), 122, y + 24);
    ctx.fillStyle = C.faint;
    ctx.font = F.mono(500, 12);
    spaced(ctx, (c.category || '').toUpperCase(), 122, y + 44, 2);
  }
  ctx.fillStyle = C.dim;
  ctx.font = F.mono(700, 14);
  spaced(ctx, 'SHELLS', 58, top + 254, 3);
  // shell columns sized to their names so "High Explosive" fits next to "Standard"
  let shellSize = 16;
  const shellW = () => b.shells.map((s) => 34 + Math.max(ctx.measureText(s.name).width, 62));
  ctx.font = F.sans(600, shellSize);
  while (shellSize > 12 && shellW().reduce((a, c) => a + c, 0) + 2 * 14 > 346) ctx.font = F.sans(600, --shellSize);
  let sx = 58;
  const widths = shellW();
  for (let i = 0; i < 3; i++) {
    const s = b.shells[i];
    const si = await img(path.join(dir, 'images/ammo', `${s.id}.webp`));
    if (si) ctx.drawImage(si, sx, top + 268, 28, 28);
    ctx.fillStyle = C.fg;
    ctx.font = F.sans(600, shellSize);
    ctx.fillText(fit(ctx, s.name, widths[i] - 34), sx + 34, top + 283);
    ctx.fillStyle = C.faint;
    ctx.font = F.mono(500, 11);
    spaced(ctx, s.slot.toUpperCase(), sx + 34, top + 299, 1.5);
    sx += widths[i] + 14;
  }

  // talents
  const tx = 438;
  panel(ctx, tx, top, 422, ph, 'TALENTS');
  ctx.font = F.cond(700, 30);
  const ptsX = tx + 118;
  ctx.fillStyle = '#8f97c0';
  const ptsText = `${b.spent}/${b.budget}`;
  const ptsW = ctx.measureText(ptsText).width + 16;
  ctx.fillRect(ptsX, top + 10, ptsW, 30);
  ctx.fillStyle = '#040a1c';
  ctx.fillText(ptsText, ptsX + 8, top + 36);
  const barX = ptsX + ptsW + 14;
  const barW = tx + 404 - barX;
  ctx.fillStyle = C.tile;
  ctx.fillRect(barX, top + 21, barW, 9);
  ctx.fillStyle = C.amber;
  ctx.fillRect(barX, top + 21, barW * Math.min(1, b.spent / b.budget), 9);
  ctx.fillStyle = C.amberDot;
  for (let px = barX + 1; px < barX + barW * Math.min(1, b.spent / b.budget) - 1; px += 3) for (let py = top + 23; py < top + 29; py += 3) ctx.fillRect(px, py, 1, 1);

  const T = 48;
  const GX = 8;
  const GY = 12;
  const ox = tx + 19;
  const oy = top + 58;
  const pos = new Map(b.nodes.map((n) => [n.talent.id, { x: ox + n.tier * (T + GX), y: oy + n.row * (T + GY), n }]));
  // prerequisite links
  ctx.lineWidth = 3;
  for (const { x, y, n } of pos.values()) {
    for (const pre of n.prerequisiteIds ?? []) {
      const p = pos.get(pre);
      if (!p) continue;
      const met = (b.points[pre] || 0) > 0 && (b.points[n.talent.id] || 0) > 0;
      ctx.strokeStyle = met ? C.paper : '#3a4058';
      ctx.beginPath();
      ctx.moveTo(p.x + T / 2, p.y + T / 2);
      ctx.lineTo(x + T / 2, y + T / 2);
      ctx.stroke();
    }
  }
  for (const { x, y, n } of pos.values()) {
    const id = n.talent.id;
    const p = b.points[id] || 0;
    const maxed = p >= n.maxPoints;
    const state = p === 0 ? 'zero' : maxed ? 'max' : 'part';
    chamferPath(ctx, x, y, T, T, 8);
    if (state === 'max') {
      ctx.save();
      ctx.shadowColor = 'rgba(201,205,240,0.35)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = C.paper;
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = state === 'part' ? C.lilac : C.tile;
      ctx.fill();
      ctx.strokeStyle = state === 'part' ? C.lilacEdge : C.tileEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (n.isKeystone) {
      ctx.fillStyle = C.amber;
      ctx.fillRect(x, y, T, 3);
    }
    const tint = state === 'max' ? '#181b2e' : state === 'part' ? '#ffffff' : C.tileIcon;
    const icon = site.icons.has(id) ? await tinted(path.join(dir, 'images/talents', `${id}.png`), tint, 36) : null;
    if (icon) ctx.drawImage(icon, x + 6, y + 6, 36, 36);
    if (state === 'max') {
      ctx.fillStyle = C.notch;
      ctx.beginPath();
      ctx.moveTo(x + T + 1, y + T - 6);
      ctx.lineTo(x + T + 1, y + T + 1);
      ctx.lineTo(x + T - 6, y + T + 1);
      ctx.closePath();
      ctx.fill();
    } else if (state === 'part') {
      ctx.fillStyle = '#161d43';
      ctx.font = F.mono(700, 11);
      const t = `${p}/${n.maxPoints}`;
      ctx.fillText(t, x + T - ctx.measureText(t).width - 3, y + 12);
    }
  }
  if (b.keystones.length) {
    ctx.fillStyle = C.amber;
    ctx.font = F.mono(700, 12);
    const kx = spaced(ctx, 'KEYSTONE', tx + 19, top + ph - 20, 2.5);
    ctx.fillStyle = C.fg;
    ctx.font = F.sans(600, 16);
    ctx.fillText(fit(ctx, b.keystones.join(', '), tx + 404 - kx - 12), kx + 12, top + ph - 20);
  }

  // stats
  const sx0 = 876;
  panel(ctx, sx0, top, 284, ph, 'STATS');
  b.stats.slice(0, 8).forEach((s, i) => {
    const bx = sx0 + 16 + (i % 2) * 130;
    const by = top + 46 + Math.floor(i / 2) * 70;
    ctx.fillStyle = C.strip;
    ctx.fillRect(bx, by, 122, 62);
    ctx.strokeStyle = '#30374a';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, 121, 61);
    ctx.fillStyle = C.dim;
    fitSpaced(ctx, s.label.toUpperCase(), 106, 700, 11, 1.2);
    spaced(ctx, s.label.toUpperCase(), bx + 9, by + 17, 1.2);
    ctx.fillStyle = C.fg;
    ctx.font = F.cond(700, 31);
    const val = b.fmt(s.value);
    ctx.fillText(val, bx + 9, by + 50);
    let ux = bx + 9 + ctx.measureText(val).width + 4;
    if (s.unit) {
      ctx.fillStyle = C.faint;
      ctx.font = F.mono(500, 12);
      ctx.fillText(s.unit, ux, by + 50);
      ux += ctx.measureText(s.unit).width;
    }
    if (!b.isZero(s.d)) {
      const good = s.lowerBetter ? s.d < 0 : s.d > 0;
      ctx.fillStyle = good ? C.good : C.bad;
      ctx.font = F.mono(700, 12);
      const t = b.signed(s.d);
      const w = ctx.measureText(t).width;
      if (ux + 6 + w <= bx + 116) ctx.fillText(t, bx + 116 - w, by + 50);
    }
  });

  // ---- footer ----
  ctx.font = F.mono(700, 15);
  ctx.fillStyle = C.fg;
  let fx = spaced(ctx, 'TYR', 40, 619, 3);
  ctx.fillStyle = C.dim;
  ctx.font = F.mono(500, 11);
  fx = spaced(ctx, 'HQ', fx + 5, 613, 2);
  ctx.fillStyle = C.faint;
  ctx.font = F.mono(500, 13);
  spaced(ctx, '·  POPI.TECH/HQ  ·  UNOFFICIAL BUILD PLANNER', fx + 14, 619, 1.5);
  ctx.font = F.mono(500, 11);
  const credit = 'GAME ART © STOKE GAMES';
  spaced(ctx, credit, W - 40 - spacedWidth(ctx, credit, 1.5), 619, 1.5);

  return canvas.encode('png');
}
