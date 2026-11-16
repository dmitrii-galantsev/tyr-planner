#!/usr/bin/env python3
"""backdrop_from_detail.py <detail-capture.jpg> <out.webp> [--empty]
Turns a capture of Tyr's tank detail screen (sharp garage scene) into the Tech Tree menu backdrop:
  backdrop = STATIC + GAIN * gaussian_blur(scene, SIGMA)
SIGMA/GAIN were fitted on the Alecto Tech Tree capture; STATIC (static.npz) is the tank-independent
part of the Tech Tree backdrop (overlay colour + vignette), measured from the Tech Tree frames."""
import sys, os, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, zoom
H,W=800,1280
SIGMA=24.0                                   # px at 1280x800
GAIN=np.array([0.075,0.041,0.051],np.float32)
HERE=os.path.dirname(os.path.abspath(__file__))
UI=[(0,0,W,6),(0,H-6,W,H),(0,0,6,H),(W-6,0,W,H),          # capture frame highlight
    (20,10,860,75),(1070,20,1262,80),(1040,100,1260,145),   # nav, profile, skin picker
    (20,95,535,535),                                        # title, ALPHA tag, stats, ability block, rail
    (20,540,1262,660),(20,660,1262,800)]                    # level cards, xp bar, buttons, footer
def gauss(I,s): return np.stack([gaussian_filter(I[...,i],s,mode='nearest') for i in range(3)],-1)
def fill(I,valid):
    mf=valid.astype(np.float32); res=None
    for s in [400,200,100,50,25,12,6,3]:
        w=gaussian_filter(mf,s,mode='nearest')
        v=np.stack([gaussian_filter(I[...,i]*mf,s,mode='nearest') for i in range(3)],-1)/np.maximum(w[...,None],1e-6)
        conf=np.clip((w-0.02)/0.25,0,1)[...,None]
        res=v if res is None else res*(1-conf)+v*conf
    return np.where(valid[...,None],I,res)
BADGE=(1150,150,1262,295)                                  # mastery medal + "x5" drawn over the tank
HAS_BADGE={'vtol','recall','healer','ram','brawler','sentinel'}
TANK=(545,145,1274,540)                                    # where the tank stands (for the empty-garage fallback)
def scene(path,empty=False):
    """sharp garage scene from a detail-screen capture (any size, same framing): 2D UI masked and filled"""
    D=np.asarray(Image.open(path).convert('RGB').resize((W,H),Image.LANCZOS)).astype(np.float32)
    ui=np.zeros((H,W),bool)
    rects=list(UI)
    vid=os.path.basename(path).replace('detail-','').split('.')[0]
    if vid in HAS_BADGE: rects.append(BADGE)
    if empty: rects.append(TANK)
    for x0,y0,x1,y1 in rects: ui[y0:y1,x0:x1]=1
    return fill(D,~ui)
def tank_term(path,empty=False): return gauss(scene(path,empty),SIGMA)*GAIN
def save(rec,out):
    big=np.stack([zoom(rec[...,i],1.5,order=3,mode='nearest') for i in range(3)],-1)
    Image.fromarray(np.clip(big+0.5,0,255).astype(np.uint8)).save(out,lossless=True,method=6)
if __name__=='__main__':
    static=np.load(os.path.join(HERE,'static.npz'))['static']
    empty='--empty' in sys.argv            # no capture for this tank: same garage with the tank filled out
    rec=static+tank_term(sys.argv[1],empty)
    save(rec,sys.argv[2]); print(sys.argv[2],os.path.getsize(sys.argv[2]))
