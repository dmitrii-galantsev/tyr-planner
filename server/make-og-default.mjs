// One-off: renders site/og-default.png, the preview image for a plain popi.tech/hq/ link.
// node make-og-default.mjs ../site
import path from 'node:path';
import fs from 'node:fs';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
const site = process.argv[2] || '../site';
for (const f of ['BarlowCondensed_700Bold', 'JetBrainsMono_500Medium', 'JetBrainsMono_700Bold', 'Inter_600SemiBold']) GlobalFonts.registerFromPath(`fonts/${f}.ttf`);
const W = 1200, H = 630;
const c = createCanvas(W, H), x = c.getContext('2d');
x.fillStyle = '#131820'; x.fillRect(0, 0, W, H);
const bd = await loadImage(path.join(site, 'images/backdrops/drone.webp'));
const s = Math.max(W / bd.width, H / bd.height);
x.drawImage(bd, (W - bd.width * s) / 2, (H - bd.height * s) / 2, bd.width * s, bd.height * s);
const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(19,24,32,0.85)'); g.addColorStop(0.7, 'rgba(19,24,32,0.2)'); g.addColorStop(1, 'rgba(19,24,32,0.1)');
x.fillStyle = g; x.fillRect(0, 0, W, H);
x.fillStyle = '#e8e8ff'; x.fillRect(0, 0, W, 4);
const spaced = (t, px, py, sp) => { let cx = px; for (const ch of t) { x.fillText(ch, cx, py); cx += x.measureText(ch).width + sp; } return cx; };
// mark
x.fillStyle = '#e8e8ff'; x.beginPath(); x.moveTo(60, 62); x.lineTo(150, 62); x.lineTo(150, 128); x.lineTo(126, 152); x.lineTo(60, 152); x.closePath(); x.fill();
x.fillStyle = '#13132a'; x.beginPath(); x.moveTo(78, 78); x.lineTo(132, 78); x.lineTo(132, 94); x.lineTo(113, 94); x.lineTo(113, 138); x.lineTo(97, 138); x.lineTo(97, 94); x.lineTo(78, 94); x.closePath(); x.fill();
x.fillStyle = '#0ef6c8'; x.beginPath(); x.moveTo(154, 134); x.lineTo(154, 156); x.lineTo(132, 156); x.closePath(); x.fill();
x.fillStyle = '#e8eeff'; x.font = '700 150px "Barlow Condensed"'; x.fillText('TYR', 176, 152);
const tw = x.measureText('TYR').width;
x.fillStyle = '#a4abc6'; x.font = '700 40px "JetBrains Mono"'; spaced('HQ', 176 + tw + 16, 96, 8);
x.fillStyle = '#c3c9e0'; x.font = '500 30px "JetBrains Mono"'; spaced('TYR BUILD PLANNER', 64, 222, 6);
x.fillStyle = '#e8eeff'; x.font = '600 26px "Inter"';
x.fillText('Talents, components, shells and live stats for all 18 tanks.', 64, 276);
x.fillStyle = '#a4abc6';
x.fillText('Share a build and it shows up in full on Discord.', 64, 314);
const ids = ['blink', 'drone', 'vanguard', 'wall', 'recall', 'slow', 'sonar'];
for (let i = 0; i < ids.length; i++) {
  const im = await loadImage(path.join(site, `images/vehicles/${ids[i]}.webp`));
  const w = 330, h = 165;
  x.drawImage(im, -30 + i * 175, 372 + (i % 2) * 34, w, h);
}
x.fillStyle = '#757b90'; x.font = '500 14px "JetBrains Mono"';
spaced('POPI.TECH/HQ  ·  UNOFFICIAL  ·  GAME ART © STOKE GAMES', 64, 612, 2);
fs.writeFileSync(path.join(site, 'og-default.png'), await c.encode('png'));
console.log('ok');
