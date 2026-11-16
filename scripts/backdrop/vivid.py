#!/usr/bin/env python3
"""vivid.py K OUTDIR [ids]: the backdrop_from_detail.py pipeline for every tank, with the tank's glow
scaled by K so tanks read differently (the site uses K=4).

    CAPTURES=/path/to/captures python3 scripts/backdrop/vivid.py 4 site/images/backdrops

CAPTURES holds detail-<vehicleId>.jpg screenshots of each tank's detail screen in Tyr (not included)."""
import sys, os, numpy as np
import backdrop_from_detail as B
K=float(sys.argv[1]); out=sys.argv[2]; os.makedirs(out,exist_ok=True)
static=np.load(os.path.join(B.HERE,'static.npz'))['static']
ids=sys.argv[3].split(',') if len(sys.argv)>3 else 'blink brawler bush canopener deadeye drone healer ram ranger recall seeker sentinel slow sonar stealth vanguard vtol wall'.split()
for vid in ids:
    rec=static+K*B.tank_term(os.path.join(os.environ.get('CAPTURES', os.path.join(B.HERE, 'captures')), f'detail-{vid}.jpg'))
    B.save(rec,f'{out}/{vid}.webp')
print('ok',K,len(ids))
