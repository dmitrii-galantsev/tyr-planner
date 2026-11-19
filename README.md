# Tyr planner

A build planner and reference for **Tyr** (Stoke Games): pick a tank, components and shells, spend
talent points, and see every stat change live. Share a build as a link; posted on Discord, it unfurls
into a card with the whole build.

- **Live:** [popi.tech/hq](https://popi.tech/hq/), with Discord link previews and community builds
- **GitHub Pages copy:** [dmitrii-galantsev.github.io/tyr-planner](https://dmitrii-galantsev.github.io/tyr-planner/),
  built from this repository (no community builds; share links point to popi.tech)

Unofficial fan project, not endorsed by Stoke Games.

## Features

Five views, switched from the top bar:

- **Build**: components, shells and saved builds on the left, talent tree in the middle, stats on the
  right. `Export` copies a `TYR01_` code for the game's loadout import; `Copy link` copies a share link.
- **Tanks**: stock stats for every tank, sortable, best value per column highlighted.
- **Community**: builds from tyrhq.com, searchable and filterable by tank; click one to load it.
- **Components**: every component and the shell table.
- **Talents**: every talent tree, searchable, filterable by tank.

Talent editing:

- Click a talent for +1, right-click or shift-click for −1, click a segment of its bar to set that rank.
- Keyboard on a focused talent: `+`/`−` or arrows, `m` max, `0` clear, `←`/`→` move between tiers.
- Points go in any order. The 31-point cap and each talent's max are enforced; a talent whose tier gate
  or prerequisite is not met turns red instead of being blocked, and `Export` warns about it.
- Prerequisite lines are teal when met, red when blocking a talent that has points, amber on hover.
- `Auto-fill` spends the remaining points top-down, following the rules. `n`, `s`, `l`: new build,
  save, copy link.

The stat panel hides stats that are identical on every tank and unchanged by the build, and stats that
are zero before and after; `Only changed` hides the rest of the unchanged ones. Conditional effects count
in the stats and are marked in each stat's breakdown (hover a stat). Headline DPM is the guaranteed
figure; `DPM, conditional` appears under Firepower when it differs.

On [popi.tech/hq](https://popi.tech/hq/), the Build tab updates the address bar as you edit. Paste that
address into Discord to preview the exact build, even if you never used **Save** or **Copy link**. Links
are snapshots: editing the draft later does not change a link you already shared. Opening the plain
planner URL starts an untitled stock build. Other tabs show `#v=<view>` instead and keep your draft
in this browser. Saved builds are local to the browser too; sharing a link does not list a build in
Community.

**Save** keeps a named snapshot. Save under the same name to update it, or use a different name to keep
both. If you leave the name blank, the planner names it after the tank. In **Saved builds**, use
the link icon beside a snapshot to share it without switching away from your draft. You can also rename
or delete a snapshot; **Undo** is available after replacing or deleting one.

The static GitHub Pages copy uses `#s=<code>` so drafts can reload without a server. Use **Copy link**
there for a Discord preview. Old `#s=` and `#b=` bookmarks still open on the live planner.

## How it works

- **Game data** comes from Stoke Games' official [GameData](https://github.com/StokeGames/GameData)
  export, a git submodule pinned to one game version. `scripts/build.mjs` turns its
  `generated/runtime.json` into `dist/data.js`.
- **Stats and talent rules** come from [Tyr HQ](https://github.com/wackoisgod/tyrhq)'s engine
  (`src/lib/game-engine`, MIT), bundled into `site/vendor/tyrhq-engine.js` by
  `scripts/vendor-engine.mjs`. The planner never does its own stat math.
- **Art** (tank renders, ability, shell, component and talent icons) is GameData's, resized and
  re-encoded by `scripts/assets.py`. The garage backdrops behind each tank are rebuilt from screenshots
  of the game's tank screen (`scripts/backdrop/`).
- **Share links** (`/b/<code>`) carry the whole build in a compact code (`site/sharing.js`). On
  popi.tech, a small Node service (`server/`) answers those links for Discord and other unfurlers with
  Open Graph tags and a rendered 1200×630 card, and sends browsers on to the planner.
- **Community builds** are a local snapshot of tyrhq.com's public build list in `data/builds.json`.
  They are not in this repository; without the file the Community tab links to popi.tech instead.

## Development

Needs Node 20.11 or newer. Python 3 is used for the dev server and the art script.

```sh
GIT_LFS_SKIP_SMUDGE=1 git clone --recurse-submodules https://github.com/dmitrii-galantsev/tyr-planner
cd tyr-planner
npm run build      # dist/
npm test           # engine parity and share/game code checks
npm run serve      # http://127.0.0.1:8781/
```

`GIT_LFS_SKIP_SMUDGE=1` skips GameData's 3D models and images (Git LFS, a few hundred MB); the build only
needs `GameData/generated/runtime.json`, which is plain git.

`site/` is the source; `dist/` is generated. The build adds `?v=<hash>` to every script and stylesheet
URL, so there are no version numbers to bump by hand.

### Updating

- **Game patch:** popi.tech picks it up on its own within the hour (see Deployment). For the repository
  and GitHub Pages, Dependabot opens a pull request when GameData changes; merge it. Locally:
  `git submodule update --remote GameData && npm run build && npm test`. If the patch changes art, fetch
  GameData's images (`git -C GameData lfs pull --include "assets/images/**"`) and run `npm run assets`.
  A new tank, shell or component also needs an entry in the id lists at the top of `site/sharing.js`
  (append only: share codes index into those lists) and in `GAME_ORDER` in `site/core.js`.
- **Client stock stats:** when the public GameData is older than the November 19, 2026 client
  (CL 39928), `scripts/gamedata.mjs` overlays shared numeric tank stats from
  `scripts/snapshots/client-39928.json`. These are client defaults, not measurements of live
  server behavior. For example, both the garage and the client table give Alecto 1,000 stock HP,
  while the notes say 1,050. Terrapin is editable: `scripts/terrapin.mjs` pairs the 22 talent
  definitions in `DT_TalentTreeData.json` with the layout and rank caps shown in the CL 39928
  Tech Tree. Shell Swap Time caps at two ranks in-game even though the client table contains
  three values. Shelled Reload is conditional; Shell Break’s 6-energy-on-break
  effect is described in its tooltip, not modeled as a permanent stat. Two CL 39928 game
  exports, one for each keystone, verify tree version 37081 and serve as loadout test fixtures.
  To regenerate the snapshot from already decoded JSON, run
  `node scripts/import-client-dump.mjs --cl 39928 --tanks /path/to/export/json --talents /path/to/Terrapin/DT_TalentTreeData.json`
  and review its stdout before replacing the snapshot. Compare the result with
  `node scripts/compare-tank-stats.mjs /path/to/export/json`; it checks only shared numeric stats.
- **Patch notes ahead of GameData:** the November 9 notes and
  [November 19 notes](https://store.steampowered.com/news/app/2445260/view/678515671123886389)
  still supply ability text and component changes not covered by the tank tables. Compare these
  changes with the next public GameData export before retiring the patch-note overlays.
- **Engine:** clone wackoisgod/tyrhq, then `npm install` and `npm run vendor:engine -- <path>`, then `npm test`.
- **Preview card for plain links** (`site/og-default.png`): `cd server && npm ci && node make-og-default.mjs ../site`.

### Checks

`npm test` (`scripts/check.mjs`) runs offline:

- the reference build `otf4zfz9` against the numbers tyrhq.com showed for it on 2026-11-11
  (233.5 damage, 56.2 % camo, 75.26 kph, 12 secondary shells, −11° gun depression, 2.5 s precision aim),
  enforced for GameData CL 37952; on other game versions every tank only has to compute;
- the November 19 overlay (stock health, Atlas, Seeker, four components) while it applies, and the
  Terrapin tree and its two game exports while the planner supplies Terrapin;
- share links for every tank’s stock build and 20 random builds per tank, plus the live and static draft URL formats and imported build names;
- `TYR01_` game codes: byte parity with a code exported from tyrhq.com, UTF-16 names, round trips and
  rejection of malformed codes.

## Deployment

popi.tech/hq deploys itself. On popi, `tyr-planner-sync` (`server/tyr-planner-sync.service` and `.timer`,
running `scripts/sync-popi.sh` hourly) checks a clone of this repository for:

- new commits on `main`,
- a newer GameData than the pinned submodule (popi does not wait for the Dependabot pull request),
- a new `data/` snapshot (community builds).

When something changed, it regenerates only the images Stoke changed, builds, runs `npm test`, and only
then publishes `dist/` and the preview service and restarts it. If the checks fail (for example a patch
adds a tank whose id `site/sharing.js` does not know yet), the live site stays as it was and
`journalctl -u tyr-planner-sync` says why.

`./deploy.sh` runs the same sync immediately after copying your local `data/` to popi. It deploys
`origin/main`, so it refuses to run with uncommitted or unpushed changes. GitHub Pages is built by
`.github/workflows/pages.yml` on every push to `main`.

The preview service (`server/`, systemd unit `server/tyrhq-embed.service`, listening on 127.0.0.1:8787):

- `GET /hq/b/<code>`: a page with Open Graph and Twitter tags (the build's title and its card) that sends
  browsers on to `/hq/#s=<code>`;
- `GET /hq/og/<code>.png`: the card, rendered with `@napi-rs/canvas` (about 160 ms, then cached);
- it imports `data.js`, `core.js` and `sharing.js` from the deployed site, so a preview always matches
  the planner.

nginx pieces: `server/nginx-tyrhq-embed.conf` (in the server block: proxies the two paths above, falls back
to the static planner if the service is down, and sends `Cache-Control: no-cache` for the planner's page,
scripts and data) and `server/nginx-tyrhq-cache.conf` (http level: the map behind that header).

Setting up a server from scratch: clone the repository to `~/tyr-planner` with its submodule
(`GIT_LFS_SKIP_SMUDGE=1`), install `git-lfs` and Pillow (`python3-pil`), copy the two units to
`/etc/systemd/system/`, enable `tyr-planner-sync.timer` and `tyrhq-embed`, and add the nginx snippets.

## Layout

| Path | What |
|---|---|
| `site/index.html`, `site/style.css` | page and styles |
| `site/app.js` | views, talent editor, stat panel, tables, URL state |
| `site/core.js` | DOM-free build logic shared with `server/` (engine re-exports, formatting, normalisation) |
| `site/sharing.js` | share-link codes and the game's `TYR01_` loadout codes |
| `site/components.js`, `site/import.js` | component slots and picker, import dialog |
| `site/icons.js`, `site/dom.js` | line icons, DOM helpers |
| `site/vendor/tyrhq-engine.js` | Tyr HQ's engine (generated, do not edit) |
| `site/images/` | art from GameData (plus `backdrops/`), and its license |
| `site/fonts/` | Barlow Condensed, JetBrains Mono, Inter (SIL OFL) |
| `server/` | link-preview service, the systemd units on popi, nginx snippets |
| `scripts/` | build, checks, popi sync, art, engine vendoring, backdrop pipeline |
| `GameData/` | Stoke Games' data export (submodule) |
| `data/` | local only: `builds.json` (community builds) and `meta.json` (its date) |

## Licenses

- Original code and docs in this repository: [MIT](LICENSE).
- Third-party material (Tyr HQ's engine, Stoke Games' data and art, fonts): see [NOTICE.md](NOTICE.md).
  Tyr and all related names and art belong to Stoke Games.
