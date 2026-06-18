/**
 * seed-layout.mjs — 카드 레이아웃 시드/리셋.
 *   현재 분수 spec(card.spec.js) → 절대좌표 레이아웃(public/card.layout.json) 재생성.
 *   편집기에서 망가졌을 때 기본값 복원, 또는 spec 수정 후 시드 갱신에 사용.
 *
 * 사용: node scripts/seed-layout.mjs   (또는 npm run ui:seed-layout)
 */
import { writeFileSync } from 'node:fs';
import { DEFAULT_LAYOUT } from '../src/config/card-layout.js';

const round = (o) => {
  const r = {};
  for (const k in o) r[k] = typeof o[k] === 'number' ? Math.round(o[k] * 10) / 10 : o[k];
  return r;
};
const out = { frame: DEFAULT_LAYOUT.frame, nodes: DEFAULT_LAYOUT.nodes.map(round) };
writeFileSync('public/card.layout.json', JSON.stringify(out, null, 2));
console.log(`시드 완료: public/card.layout.json (${out.nodes.length} 노드)`);
