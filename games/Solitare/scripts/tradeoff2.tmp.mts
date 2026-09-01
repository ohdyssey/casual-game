/** 완화 기준(잔여≤2 · 구매≤3) 달성 가능성 보고 — 레벨·뽑기 스윕(레벨당 200판). */
import fs from 'node:fs';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { authoredFromRuntime, gradeForLevel } from './level-curve.mts';
import { playout } from './play-sim.mts';
const pack = JSON.parse(fs.readFileSync('public/levels/cardLevels.json','utf8')) as any;
const T = 200;
const LEVELS = (process.argv[2] ?? '15,22,60,120,200,300,400,480').split(',').map(Number);
for (const level of LEVELS) {
  const doc = pack.levels[String(level)] as CardBoardDoc & any;
  const layout = cardBoardToLayout(doc, 'lv'+level);
  const grade = ((layout as any).difficulty ?? gradeForLevel(level)) as 1|2|3;
  const rows: string[] = [];
  let bestBoth: string | null = null;
  for (let rt = 2; rt <= 16; rt++) {
    const start = dealDynamic(layout, seededRng(level*7919+104729), grade, {
      board: doc.deal.board, waste: doc.deal.waste, stockCount: authoredFromRuntime(rt),
      rescue: level<=10, plus5Curated: level<=20 });
    let leftMax=0,noBuyWins=0,ex4=0,buysMax=0,buysSum=0;
    for (let i=0;i<T;i++){
      const a=playout(layout,start,level,seededRng(level*100000+i*7+1),false);
      if(a.win){noBuyWins++;leftMax=Math.max(leftMax,a.leftover);}
      const b=playout(layout,start,level,seededRng(level*100000+5_000_000+i*7+1),true);
      if(b.buys>=4)ex4++;buysMax=Math.max(buysMax,b.buys);buysSum+=b.buys;
    }
    const okL = leftMax<=2, okB = ex4===0;
    rows.push(`  ${String(rt).padStart(2)}장: 잔여max ${String(leftMax).padStart(2)}${okL?'✅':'❌'} 4회+ ${String((ex4/T*100).toFixed(1)).padStart(5)}%${okB?'✅':'❌'} (구매평균 ${(buysSum/T).toFixed(1)}·최대 ${buysMax}·무구매승 ${noBuyWins}/${T})`);
    if (okL && okB && !bestBoth) bestBoth = `${rt}장`;
  }
  console.log(`lv${level} (보드 ${doc.deal.board.length}) → 동시 만족 뽑기: ${bestBoth ?? '없음'}`);
  console.log(rows.join('\n'));
}
