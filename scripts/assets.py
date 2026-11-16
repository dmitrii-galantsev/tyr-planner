#!/usr/bin/env python3
"""Regenerate site/images from Stoke Games' GameData images.

The GameData license allows build planners to use and redistribute these assets with technical
changes only (resizing, format, compression), so this script does exactly that and nothing else.

GameData keeps its images in Git LFS. Fetch just the images (not the 3D models) first:

    git -C GameData lfs pull --include "assets/images/**"
    python3 scripts/assets.py            # or: python3 scripts/assets.py /path/to/GameData

Needs Pillow. The backdrops in site/images/backdrops are not from GameData; see scripts/backdrop/.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GAMEDATA = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "GameData"
SRC = GAMEDATA / "assets" / "images"
OUT = ROOT / "site" / "images"


def pngs(folder):
    files = sorted((SRC / folder).glob("*.png"))
    if not files:
        sys.exit(f"no images in {SRC / folder}: run git -C GameData lfs pull --include \"assets/images/**\"")
    for f in files:
        if f.stat().st_size < 1024 and f.read_bytes().startswith(b"version https://git-lfs"):
            sys.exit(f"{f} is a Git LFS pointer: run git -C GameData lfs pull --include \"assets/images/**\"")
    return files


def webp(src, dest, width=None, quality=90):
    im = Image.open(src).convert("RGBA")
    if width and im.width != width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "WEBP", quality=quality, method=6)


def main():
    count = 0
    # tank renders: picker and tables, build header, preview cards
    for f in pngs("vehicles"):
        for suffix, width, quality in (("-s", 256, 88), ("", 768, 88), ("-l", 1024, 90)):
            webp(f, OUT / "vehicles" / f"{f.stem}{suffix}.webp", width, quality)
            count += 1
    for folder in ("abilities", "ammo", "components"):
        for f in pngs(folder):
            webp(f, OUT / folder / f"{f.stem}.webp")
            count += 1
    webp(SRC / "icons" / "alpha-program.png", OUT / "icons" / "alpha-program.webp")
    count += 1
    # talent icons stay greyscale PNGs: the planner uses them as CSS masks, the card renderer tints them
    (OUT / "talents").mkdir(parents=True, exist_ok=True)
    for f in pngs("talents"):
        im = Image.open(f).convert("L").resize((128, 128), Image.LANCZOS)
        im.save(OUT / "talents" / f"{f.stem}.png", optimize=True)
        count += 1
    print(f"{count} images -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
