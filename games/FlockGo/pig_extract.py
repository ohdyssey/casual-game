import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage.feature import peak_local_max
SRC=r"C:/Users/user/AppData/Local/Temp/claude/d--Dev-CasualGame-games-FlockGo/f3d4d86a-46d1-4baf-9307-8d5de3b34398/scratchpad/ref_84.png"
OUT=r"C:/Users/user/AppData/Local/Temp/claude/d--Dev-CasualGame-games-FlockGo/f3d4d86a-46d1-4baf-9307-8d5de3b34398/scratchpad"
im=Image.open(SRC).convert("RGB"); A=np.asarray(im).astype(np.int16)
R,G,B=A[:,:,0],A[:,:,1],A[:,:,2]
fx0,fy0,fx1,fy1=30,560,1050,2090
# pig body (pink): R high, R notably > G
pig=(R>150)&((R-G)>18)&((R-B)>2)
mask=np.zeros_like(pig); mask[fy0:fy1,fx0:fx1]=True
pig&=mask
pig=ndimage.binary_fill_holes(pig)
pig=ndimage.binary_opening(pig, iterations=2)
dist=ndimage.distance_transform_edt(pig)
# peaks = pig centers
coords=peak_local_max(dist, min_distance=30, threshold_abs=10, exclude_border=False)
print("centers detected:",len(coords))
# eyes/dark features (brown/dark, not green, not bright pink)
dark=(R<150)&(G<120)&(B<120)&((R+G+B)<340)&(G<=R+15)
dark&=mask
draw=im.copy(); dr=ImageDraw.Draw(draw)
H,W=pig.shape
def face_dir(cy,cx,rad=52):
    y0=max(0,cy-rad);y1=min(H,cy+rad);x0=max(0,cx-rad);x1=min(W,cx+rad)
    sub=dark[y0:y1,x0:x1]
    ys,xs=np.nonzero(sub)
    if len(xs)<6: return None
    fx=xs.mean()+x0; fy=ys.mean()+y0
    v=np.array([fx-cx, fy-cy])
    if np.hypot(*v)<3: return None
    return v
recs=[]
for (cy,cx) in coords:
    v=face_dir(cy,cx)
    dr.ellipse([cx-4,cy-4,cx+4,cy+4], fill=(0,0,255))
    if v is not None:
        u=v/np.hypot(*v)*42
        dr.line([cx,cy,cx+u[0],cy+u[1]], fill=(255,0,0), width=5)
        dr.ellipse([cx+u[0]-6,cy+u[1]-6,cx+u[0]+6,cy+u[1]+6], fill=(255,255,0))
    recs.append((int(cx),int(cy),None if v is None else (float(v[0]),float(v[1]))))
draw.save(OUT+"/pig_extract_overlay.png")
import json
json.dump(recs, open(OUT+"/pig_recs.json","w"))
# tally 4-diagonal classification (nearest of NE/SE/SW/NW)
import math
diagset={'ne':(1,-1),'se':(1,1),'sw':(-1,1),'nw':(-1,-1)}
tally={k:0 for k in diagset}; none=0
for _,_,v in recs:
    if v is None: none+=1; continue
    vx,vy=v; best=None;bd=-9
    for k,(dx,dy) in diagset.items():
        d=(vx*dx+vy*dy)/ (math.hypot(vx,vy)*math.hypot(dx,dy))
        if d>bd: bd=d;best=k
    tally[best]+=1
print("diag tally",tally,"none",none)
