import numpy as np, json, math
OUT=r"C:/Users/user/AppData/Local/Temp/claude/d--Dev-CasualGame-games-FlockGo/f3d4d86a-46d1-4baf-9307-8d5de3b34398/scratchpad"
recs=json.load(open(OUT+"/pig_recs.json"))
P=[]
for p in np.array([[r[0],r[1]] for r in recs],float):
    if all(np.hypot(*(p-q))>22 for q in P): P.append(p)
P=np.array(P)
# blob center from extents
cx=(P[:,0].min()+P[:,0].max())/2; cy=(P[:,1].min()+P[:,1].max())/2
print("blob center",cx,cy,"n",len(P))
# design offset: normalize ref(1080 wide) to FIELD_W=1000
s=1000.0/1080.0
diagset={'ne':(1,-1),'se':(1,1),'sw':(-1,1),'nw':(-1,-1)}
entries=[]
for x,y in P:
    ox=(x-cx)*s; oy=(y-cy)*s
    # outward direction = nearest 4-diagonal of (ox,oy)
    best=None;bd=-9
    for k,(dx,dy) in diagset.items():
        n=math.hypot(ox,oy) or 1
        d=(ox*dx+oy*dy)/(n*math.sqrt(2))
        if d>bd: bd=d;best=k
    entries.append({"x":round(ox,1),"y":round(oy,1),"dir":best})
# write TS
ts="/** AUTO-GENERATED from 돼지게임 5스테이지 레퍼런스(ref_84.png) — 위치(디자인px, 블롭중심기준)+바깥향 방향.\n"
ts+=" * 배치·방향 스터디용 고정 인스턴스(#2). 방향은 레퍼런스의 바깥향(radial) 원칙으로 1차 배정, 이후 육안 교정. */\n"
ts+="import type { Dir } from './types.js';\n\n"
ts+="export interface RefPig { readonly x: number; readonly y: number; readonly dir: Dir }\n\n"
ts+="export const REFERENCE_LEVEL: readonly RefPig[] = [\n"
for e in entries:
    ts+=f"  {{ x: {e['x']}, y: {e['y']}, dir: '{e['dir']}' }},\n"
ts+="];\n"
open(r"d:/Dev/CasualGame/games/FlockGo/src/logic/referenceLevel.ts","w",encoding="utf-8").write(ts)
from collections import Counter
print("dir tally",Counter(e['dir'] for e in entries))
print("wrote referenceLevel.ts with",len(entries),"pigs")
