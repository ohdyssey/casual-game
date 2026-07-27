/**
 * verify-levels.mts — 생성된 레벨 JSON 을 **실좌표 기준**으로 종합 검증한다.
 * 사용: npx tsx scripts/verify-levels.mts <파일1> [파일2 ...]
 *
 * 검사 항목:
 *  [1] 보드 경계(55~1025 / 787~1950) 초과 — 실제 PlayScene 프레임.
 *  [2] **오픈 카드 위에 그를 덮는 카드가 없는가**(PO 핵심 요구) — 겹침 15% 이상이면 위반.
 *  [3] 좌우대칭 — 모든 카드가 중심선 기준 거울짝을 갖는가(레이어까지 동일).
 *  [4] 딜 무결성 + 해답(solution) 보유 여부.
 *  [5] 카드수 하한선(24~56 곡선) 충족.
 *  [6] 배치 중복 — 서로 다른 레벨이 완전히 같은 배치인가("동일한 것이 많다" 방지).
 */
import fs from 'node:fs';
import { isTrapLevel } from './trap-levels.mts';
import { targetCardsForLevel, gradeForLevel } from './level-curve.mts';

const CARD_W = 120, CARD_H = 164;
const FRAME = { top: 787, bottom: 1950, left: 55, right: 1025 };
const COVER_MIN = 0.15; // editorLevels.ts PERCEPTIBLE_COVER 와 동일.

interface Slot { id: string; x: number; y: number; layer: number; face?: string }
interface LevelDoc { name: string; slots: Slot[]; trap?: boolean; difficulty?: { target?: number }; deal?: { board?: unknown[]; stock?: unknown[]; solution?: unknown[] } }

const files = process.argv.slice(2);
if (files.length === 0) { console.error('사용: verify-levels.mts <파일1> [파일2 ...]'); process.exit(1); }

const levels = new Map<number, LevelDoc>();
for (const f of files) {
  const parsed = JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, LevelDoc> | { levels: Record<string, LevelDoc> };
  const src = 'levels' in parsed ? parsed.levels : parsed;
  for (const [k, v] of Object.entries(src)) levels.set(Number(k), v);
}

/** 카드수·등급 기준은 level-curve.mts 하나만 본다(생성기와 기준이 갈리면 이런 검사가 무의미해진다). */
const minTotalForLevel = targetCardsForLevel;

const problems = { bounds: [] as number[], openUnder: [] as string[], asym: [] as number[], deal: [] as number[], noSolution: [] as number[], trapMismatch: [] as string[], gradeMismatch: [] as string[], floor: [] as string[], dup: [] as string[] };
const signatures = new Map<string, number>();
const keys = [...levels.keys()].sort((a, b) => a - b);

for (const lv of keys) {
  const doc = levels.get(lv)!;
  const slots = doc.slots ?? [];
  if (slots.length === 0) { problems.deal.push(lv); continue; }

  // [1] 경계.
  if (slots.some((s) => s.x - CARD_W / 2 < FRAME.left - 1 || s.x + CARD_W / 2 > FRAME.right + 1 || s.y - CARD_H / 2 < FRAME.top - 1 || s.y + CARD_H / 2 > FRAME.bottom + 1)) problems.bounds.push(lv);

  // [2] 오픈 카드 위의 덮는 카드 — 실좌표 겹침으로 판정(엔진 규칙과 동일).
  for (const a of slots.filter((s) => s.face !== 'fold')) {
    for (const b of slots) {
      if (b === a) continue;
      const dy = a.y - b.y; // 양수 = b 가 a 보다 위.
      if (dy <= 0) continue;
      const overlap = Math.max(0, CARD_W - Math.abs(b.x - a.x)) * Math.max(0, CARD_H - dy);
      if (overlap / (CARD_W * CARD_H) >= COVER_MIN) {
        problems.openUnder.push(`lv${lv}: 오픈(${a.x},${a.y}) 위에 (${b.x},${b.y})`);
        break;
      }
    }
  }

  // [3] 좌우대칭.
  const xs = slots.map((s) => s.x);
  const axis = (Math.min(...xs) + Math.max(...xs)) / 2;
  const key = (x: number, y: number, l: number) => `${Math.round(x)},${Math.round(y)},${l}`;
  const set = new Set(slots.map((s) => key(s.x, s.y, s.layer)));
  if (slots.some((s) => !set.has(key(2 * axis - s.x, s.y, s.layer)))) problems.asym.push(lv);

  // [4] 딜 + 해답. 함정 레벨(trap)은 **일부러 그대로는 못 끝내게** 만든 레벨이라 해답이 없는 게 정상이다.
  // 함정은 **런타임 승률**(동적 스톡이 부족)로 정의되고, 정적 해답은 "보드가 원리적으로 클리어 가능한가"라는
  // 다른 층위의 보증이다 — 둘은 모순이 아니므로 함정에 해답이 있어도/없어도 정상이다.
  if (!doc.deal?.board || !doc.deal?.stock) problems.deal.push(lv);
  else if (!doc.deal.solution && !doc.trap) problems.noSolution.push(lv);

  // [5] 카드수 하한.
  const floor = minTotalForLevel(lv);
  if (slots.length < floor) problems.floor.push(`lv${lv}: ${slots.length}<${floor}`);

  // [5-2] 함정 표시가 단일 기준(trap-levels.mts)과 일치하는가 — 표시 누락/오표시 둘 다 잡는다.
  if (!!doc.trap !== isTrapLevel(lv)) problems.trapMismatch.push(`lv${lv}: 문서 ${doc.trap ? '함정' : '일반'} vs 기준 ${isTrapLevel(lv) ? '함정' : '일반'}`);

  // [5-3] 난이도 등급이 곡선과 맞는가 — 전부 1(bakeLevel 기본값)로 남아 있으면 여기서 걸린다.
  const wantGrade = doc.trap ? 3 : gradeForLevel(lv);
  if ((doc.difficulty?.target ?? 1) !== wantGrade) problems.gradeMismatch.push(`lv${lv}: 등급 ${doc.difficulty?.target ?? '없음'} vs 기준 ${wantGrade}`);

  // [6] 배치 중복.
  const sig = slots.map((s) => `${Math.round(s.x)},${Math.round(s.y)}`).sort().join(';');
  const prev = signatures.get(sig);
  if (prev !== undefined) problems.dup.push(`lv${lv}=lv${prev}`);
  else signatures.set(sig, lv);
}

const show = (label: string, arr: unknown[], sample = 5) =>
  console.log(`${arr.length === 0 ? '  OK ' : '  !! '}${label}: ${arr.length}건${arr.length ? ` — 예: ${arr.slice(0, sample).join(' | ')}` : ''}`);

console.log(`검증 대상: ${keys.length}레벨 (${keys[0]}~${keys[keys.length - 1]})`);
show('보드 경계 초과', problems.bounds);
show('오픈 카드 위에 덮는 카드 존재', problems.openUnder);
show('좌우 비대칭', problems.asym);
show('딜 누락/손상', problems.deal);
show('해답 미확보(함정 제외)', problems.noSolution);

show('함정 표시가 기준과 불일치', problems.trapMismatch);
show('난이도 등급이 곡선과 불일치', problems.gradeMismatch);
show('카드수 하한 미달', problems.floor);
show('배치 완전 중복', problems.dup);
const counts = keys.map((k) => levels.get(k)!.slots.length);
console.log(`  카드수: ${Math.min(...counts)} ~ ${Math.max(...counts)} · 고유 배치 ${signatures.size}/${keys.length}`);

const fatal = problems.bounds.length + problems.openUnder.length + problems.asym.length + problems.deal.length
  + problems.trapMismatch.length + problems.gradeMismatch.length;
process.exit(fatal > 0 ? 1 : 0);
