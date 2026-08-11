import numpy as np, json, math
from PIL import Image, ImageDraw
OUT=r"C:/Users/user/AppData/Local/Temp/claude/d--Dev-CasualGame-games-FlockGo/f3d4d86a-46d1-4baf-9307-8d5de3b34398/scratchpad"
recs=json.load(open(OUT+"/pig_recs.json"))
P=[]
for p in np.array([[r[0],r[1]] for r in recs],float):
    if all(np.hypot(*(p-q))>22 for q in P): P.append(p)
P=np.array(P)  # (x,y)
# initial basis from NN analysis: ~98px at 55 and 145 deg
def basis(L,a1,a2):
    u=np.array([L*math.cos(math.radians(a1)), L*math.sin(math.radians(a1))])
    v=np.array([L*math.cos(math.radians(a2)), L*math.sin(math.radians(a2))])
    return u,v
best=None
for L in np.arange(88,108,2):
 for a1 in np.arange(48,64,2):
  for a2 in np.arange(138,154,2):
    u,v=basis(L,a1,a2)
    M=np.array([u,v]).T; Mi=np.linalg.inv(M)
    O=P.mean(0)
    for _ in range(6):
        ij=np.round((P-O)@Mi.T)
        pred=O+ij@M.T
        # refit O
        O=(P-ij@M.T).mean(0)
    ij=np.round((P-O)@Mi.T)
    pred=O+ij@M.T
    err=np.hypot(*(P-pred).T).mean()
    uniq=len(set(map(tuple,ij.astype(int))))
    if best is None or (err<best[0] and uniq>=len(P)-6):
        best=(err,L,a1,a2,O.copy(),ij.copy(),uniq,M.copy(),Mi.copy())
err,L,a1,a2,O,ij,uniq,M,Mi=best
print(f"BEST err={err:.1f}px L={L} a1={a1} a2={a2} uniq_cells={uniq}/{len(P)}")
ij=ij.astype(int)
# save fit
np.save(OUT+"/fit_ij.npy", ij); np.save(OUT+"/fit_O.npy",O); np.save(OUT+"/fit_M.npy",M)
# draw grid overlay on reference
im=Image.open(OUT+"/ref_84.png").convert("RGB"); dr=ImageDraw.Draw(im)
imin,imax=ij[:,0].min()-1,ij[:,0].max()+1; jmin,jmax=ij[:,1].min()-1,ij[:,1].max()+1
for i in range(imin,imax+1):
    a=O+np.array([i,jmin])@M.T; b=O+np.array([i,jmax])@M.T
    dr.line([a[0],a[1],b[0],b[1]],fill=(0,80,255),width=2)
for j in range(jmin,jmax+1):
    a=O+np.array([imin,j])@M.T; b=O+np.array([imax,j])@M.T
    dr.line([a[0],a[1],b[0],b[1]],fill=(0,80,255),width=2)
for (x,y),(i,j) in zip(P,ij):
    node=O+np.array([i,j])@M.T
    dr.ellipse([node[0]-7,node[1]-7,node[0]+7,node[1]+7],fill=(255,0,0))
im.save(OUT+"/ref_gridfit.png")
print("saved ref_gridfit.png")
