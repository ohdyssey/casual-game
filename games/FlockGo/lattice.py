import numpy as np, json
OUT=r"C:/Users/user/AppData/Local/Temp/claude/d--Dev-CasualGame-games-FlockGo/f3d4d86a-46d1-4baf-9307-8d5de3b34398/scratchpad"
recs=json.load(open(OUT+"/pig_recs.json"))
P=np.array([[r[0],r[1]] for r in recs],float)
# dedup within 22px
keep=[]
for p in P:
    if all(np.hypot(*(p-q))>22 for q in keep): keep.append(p)
P=np.array(keep); print("after dedup:",len(P))
# nearest neighbor vectors
from scipy.spatial import cKDTree
t=cKDTree(P)
vs=[]
for p in P:
    d,idx=t.query(p,k=5)
    for j in idx[1:]:
        v=P[j]-p
        if 40<np.hypot(*v)<130: vs.append(v)
vs=np.array(vs)
# fold to upper half (v and -v same)
vs[vs[:,1]<0]*=-1
# cluster angles
ang=np.degrees(np.arctan2(vs[:,1],vs[:,0]))
import collections
hist=collections.Counter(np.round(ang/5)*5)
print("NN angle hist (deg, folded):", sorted(hist.items(), key=lambda x:-x[1])[:8])
mag=np.hypot(vs[:,0],vs[:,1])
print("NN dist median:",np.median(mag), "p25",np.percentile(mag,25),"p75",np.percentile(mag,75))
print("x range",P[:,0].min(),P[:,0].max(),"y range",P[:,1].min(),P[:,1].max())
