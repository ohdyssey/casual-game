import numpy as np, json, math
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage.feature import peak_local_max
OUT=r"C:/Users/user/AppData/Local/Temp/claude/d--Dev-CasualGame-games-FlockGo/f3d4d86a-46d1-4baf-9307-8d5de3b34398/scratchpad"
im=Image.open(OUT+"/ref_84.png").convert("RGB"); A=np.asarray(im).astype(np.int16)
R,G,B=A[:,:,0],A[:,:,1],A[:,:,2]
fx0,fy0,fx1,fy1=30,560,1050,2090
pig=(R>145)&((R-G)>14)&((R-B)>0)
m=np.zeros_like(pig); m[fy0:fy1,fx0:fx1]=True; pig&=m
pig=ndimage.binary_fill_holes(pig); pig=ndimage.binary_opening(pig,iterations=1)
dist=ndimage.distance_transform_edt(pig)
coords=peak_local_max(dist,min_distance=24,threshold_abs=8,exclude_border=False)
# dedup 20px
P=[]
for c in coords[np.argsort(-dist[coords[:,0],coords[:,1]])]:
    if all(math.hypot(c[1]-q[1],c[0]-q[0])>26 for q in P): P.append(c)
P=np.array(P); print("centers:",len(P))
# outward dirs
cx=(P[:,1].min()+P[:,1].max())/2; cy=(P[:,0].min()+P[:,0].max())/2
s=1000.0/1080.0
diagset={'ne':(1,-1),'se':(1,1),'sw':(-1,1),'nw':(-1,-1)}
entries=[]; 
dr=ImageDraw.Draw(im)
for (yy,xx) in P:
    ox=(xx-cx)*s; oy=(yy-cy)*s
    best=None;bd=-9
    for k,(dx,dy) in diagset.items():
        n=math.hypot(ox,oy) or 1; d=(ox*dx+oy*dy)/(n*math.sqrt(2))
        if d>bd: bd=d;best=k
    entries.append({"x":round(ox,1),"y":round(oy,1),"dir":best})
    dr.ellipse([xx-6,yy-6,xx+6,yy+6],outline=(0,0,255),width=3)
im.save(OUT+"/pig_centers2.png")
ts="/** AUTO-GEN from 돼지게임 5스테이지 레퍼런스(ref_84.png). 위치=디자인px(블롭중심 기준)+바깥향. #2 스터디용. */\n"
ts+="import type { Dir } from './types.js';\n\nexport interface RefPig { readonly x: number; readonly y: number; readonly dir: Dir }\n\n"
ts+="export const REFERENCE_LEVEL: readonly RefPig[] = [\n"
for e in entries: ts+=f"  {{ x: {e['x']}, y: {e['y']}, dir: '{e['dir']}' }},\n"
ts+="];\n"
open(r"d:/Dev/CasualGame/games/FlockGo/src/logic/referenceLevel.ts","w",encoding="utf-8").write(ts)
from collections import Counter
print("dir",Counter(e['dir'] for e in entries),"wrote",len(entries))
