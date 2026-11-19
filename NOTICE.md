# Third-party material

The [MIT license](LICENSE) covers this repository's own code and docs. It does not cover the material
below, which keeps its own terms.

## Stoke Games GameData

- `GameData/` (git submodule of [StokeGames/GameData](https://github.com/StokeGames/GameData)): Tyr's
  exported game data and assets.
- `site/images/vehicles/`, `abilities/`, `ammo/`, `components/`, `icons/`, `talents/`: GameData images,
  only resized and re-encoded (`scripts/assets.py`). The Terrapin vehicle images are resized from
  the November 19, 2026 Tyr client’s Terrapin base thumbnail (CL 39928). Terrapin talent icons
  reuse GameData images with the same in-game asset path.
- `scripts/snapshots/client-39928.json`: stock tank stats and Terrapin talent rows from the
  November 19, 2026 Tyr client exports. This data is © Stoke Games.
- `dist/data.js` (generated): GameData's `runtime.json` with stock stats from the client snapshot,
  Terrapin reference data, and formatted component descriptions.

Used under the Stoke Games Data and Assets License, which allows build planners and similar Tyr projects
to use and redistribute these materials with technical changes only. Its text ships with the site as
[`site/images/STOKE-GAMEDATA-LICENSE.txt`](site/images/STOKE-GAMEDATA-LICENSE.txt). Tyr, Stoke Games and
related names and logos are trademarks of Stoke Games. This project is unofficial and not endorsed by
Stoke Games.

## Game screenshots

`site/images/backdrops/` are the game's garage backdrop, rebuilt from screenshots of Tyr's tank screen
(`scripts/backdrop/`). Game art © Stoke Games.

## Tyr HQ engine

`site/vendor/tyrhq-engine.js` is generated from [wackoisgod/tyrhq](https://github.com/wackoisgod/tyrhq)
(`src/lib/game-engine`):

> MIT License
>
> Copyright (c) 2026 Tyr HQ contributors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
> and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
> subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial
> portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
> LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
> NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
> WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
> SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Fonts

`site/fonts/` (WOFF2) and `server/fonts/` (TTF): Barlow Condensed, JetBrains Mono and Inter, under the
SIL Open Font License 1.1. Each font's license is next to it (`OFL-*.txt`).
