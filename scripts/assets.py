#!/usr/bin/env python3
"""Regenerate site/images from Stoke Games' GameData images.

The GameData license allows build planners to use and redistribute these assets with technical
changes only (resizing, format, compression), so this script does exactly that and nothing else.

GameData keeps its images in Git LFS. Fetch just the images (not the 3D models) first:

    git -C GameData lfs pull --include "assets/images/**"
    python3 scripts/assets.py                      # everything
    python3 scripts/assets.py --only assets/images/vehicles/brawler.png ...   # just these files

Needs Pillow. The backdrops in site/images/backdrops are not from GameData; see scripts/backdrop/.
"""
import argparse
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "images"
FOLDERS = ("vehicles", "abilities", "ammo", "components", "talents", "icons")
ICONS = {"alpha-program"}  # the only GameData icon the planner shows


def check_lfs(f):
    if f.stat().st_size < 1024 and f.read_bytes().startswith(b"version https://git-lfs"):
        sys.exit(f"{f} is a Git LFS pointer: run git -C GameData lfs pull --include \"assets/images/**\"")


def webp(src, dest, width=None, quality=90):
    im = Image.open(src).convert("RGBA")
    if width and im.width != width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "WEBP", quality=quality, method=6)


def convert(f):
    """Write the site image(s) for one GameData image; returns how many files were written."""
    folder = f.parent.name
    check_lfs(f)
    if folder == "vehicles":  # tank renders: picker and tables, build header, preview cards
        for suffix, width, quality in (("-s", 256, 88), ("", 768, 88), ("-l", 1024, 90)):
            webp(f, OUT / "vehicles" / f"{f.stem}{suffix}.webp", width, quality)
        return 3
    if folder == "talents":  # greyscale PNG: CSS mask in the planner, tinted by the card renderer
        (OUT / "talents").mkdir(parents=True, exist_ok=True)
        Image.open(f).convert("L").resize((128, 128), Image.LANCZOS).save(OUT / "talents" / f"{f.stem}.png", optimize=True)
        return 1
    if folder == "icons" and f.stem not in ICONS:
        return 0
    webp(f, OUT / folder / f"{f.stem}.webp")
    return 1


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--gamedata", type=Path, default=ROOT / "GameData", help="GameData checkout (default: the submodule)")
    parser.add_argument("--only", nargs="+", metavar="PATH", help="GameData-relative image paths to convert")
    args = parser.parse_args()
    src = args.gamedata / "assets" / "images"
    if args.only:
        files = [args.gamedata / p for p in args.only]
        files = [f for f in files if f.parent.name in FOLDERS and f.suffix == ".png" and f.exists()]
    else:
        files = [f for folder in FOLDERS for f in sorted((src / folder).glob("*.png"))]
        if not files:
            sys.exit(f"no images in {src}: run git -C GameData lfs pull --include \"assets/images/**\"")
    count = sum(convert(f) for f in files)
    print(f"{count} images -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
