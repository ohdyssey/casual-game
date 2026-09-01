/**
 * extend-levels.mts — 저작된 레벨을 **편집·복제해 레벨 상한까지 채운다**(PO 2026-08-30
 *   "레벨 상한 3천까지 저작. 난이도를 더 높일 필요는 없다. 기존 저작 내용을 편집하여 난이도를 유지").
 *
 * 사용: npx tsx scripts/extend-levels.mts [--to 3000] [--src-from 321] [--src-to 500] [--dry]
 *
 * ## 왜 "복사"가 아니라 이 방식인가
 * 2,500 판을 새로 설계하는 것은 분량이 아니라 **검증**이 문제다 — 판마다 풀리는지(해답 수순)와
 * 난이도(잔여·부족 분포)를 다시 재야 한다. 그래서 **난이도가 증명된 기존 판을 손대되, 손대는 방식을
 * 난이도가 수학적으로 보존되는 두 가지로만 제한**한다.
 *
 * ### 편집 1 — 좌우 반전 (`x → 1080 − x`)
 * 커버 그래프는 **겹침 면적**으로만 정해진다(`editorLevels.coverPairs`). 모든 x 를 같은 축으로
 * 뒤집으면 임의의 두 카드의 겹침 면적이 **그대로**다 → 커버 그래프가 **동일**하다. 인덱스도 안 바뀌므로
 * 저장된 해답 수순(`p<i>`)이 그대로 성립한다. 화면은 뒤집혀 보이지만 판의 구조는 같다.
 *
 * ### 편집 2 — 랭크 회전·반사 (`r → r + k` / `r → k − r`, 전부 mod 13)
 * 이 게임의 매칭은 **±1 순환**이다(A↔K, `tripeaks.wrapRank`) — 두 랭크의 차가 mod 13 으로 ±1 이면 낼 수
 * 있다. 보드·웨이스트·스톡의 랭크에 **같은 회전**을 걸면 차가 그대로 보존되고, **반사**를 걸면 차의
 * 부호만 뒤집힌다(±1 → ∓1). 어느 쪽이든 "낼 수 있는 수"의 집합이 변하지 않아 해답 수순도 그대로다.
 * 이 게임에는 특별 취급되는 랭크가 없어(A 도 K 도 순환 위의 한 점) 안전하다.
 * 회전 13 + 반사 13 = **26가지 랭크 사상**.
 *
 * 두 편집은 직교하므로 원본 1판에서 **2 × 26 = 52가지**가 나온다.
 *
 * ## ⚠️ 대상 레벨은 원본과 **같은 페이스 위상**이어야 한다
 * 저작된 스톡 장수는 그 레벨의 페이스 목표(`logic/paceCurve.paceTargetFor`)에 맞춰 튜닝된 값이다.
 * 그 목표는 `(level − 11) % 6`(넉넉/딱/모자람)과 `(level − 13) % 9`(계곡, 단 `level % 10 ≠ 0`)로 정해진다.
 * 원본과 대상의 레벨 번호 차가 **18의 배수이자 10의 배수**(= 90의 배수)면 세 조건이 전부 일치한다.
 * 그래서 원본 구간 길이를 90의 배수로 잡고 그 길이만큼 타일링한다 — 아래 `assertPhaseSafe` 가 강제한다.
 *
 * ## 난이도가 오르지 않는 이유
 * 원본 구간(기본 321~500)은 이미 **난이도 평탄 구간**이다(실측: 101레벨 이후 board ~39 · 스톡/보드
 * 비율 0.87~0.94 · 별 목표 3 으로 고정). 그 구간만 되풀이하므로 501 이후로 난이도가 더 오르지 않는다.
 *
 * 생성 후에는 반드시 `npx tsx scripts/replay-solutions.mts` 로 **엔진 규칙으로 전 레벨을 재생**해
 * 정말 클리어되는지 확인할 것(이 스크립트의 가정을 반대편에서 검증한다).
 */
import fs from 'node:fs';

interface Slot {
  id: string;
  x: number;
  y: number;
  layer: number;
  rot?: number;
  face?: string;
  [k: string]: unknown;
}
interface Deal {
  board: number[];
  waste: number;
  stock: number[];
  solution?: string[];
  [k: string]: unknown;
}
interface LevelDoc {
  id: string;
  name: string;
  level: number;
  slots: Slot[];
  deal: Deal;
  [k: string]: unknown;
}

const arg = (name: string, def: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : def;
};
const DRY = process.argv.includes('--dry');

const PACK = './public/levels/cardLevels.json';
const TARGET_TO = arg('to', 3000);
const SRC_FROM = arg('src-from', 321);
const SRC_TO = arg('src-to', 500);

/** 저작 프레임 폭 — 좌우 반전 축은 그 절반(540). 보드는 55~1025 안이라 반전해도 밖으로 안 나간다. */
const DESIGN_W = 1080;
/** 페이스 위상(6) · 계곡(9) · 10의 배수 예외를 한꺼번에 맞추는 최소 주기. */
const PHASE_PERIOD = 90;

const mod13 = (n: number): number => ((n % 13) + 13) % 13;
/** 랭크 사상 — `flip` 이면 반사(차의 부호만 뒤집힘), 아니면 회전. 둘 다 ±1 인접을 보존한다. */
const mapRank = (r: number, k: number, flip: boolean): number => mod13((flip ? -(r - 1) : r - 1) + k) + 1;

interface Variant {
  readonly mirror: boolean;
  readonly k: number;
  readonly flip: boolean;
}

/** 원본 1판에서 뽑을 수 있는 편집 조합 52가지 — 항등은 맨 뒤라 실제로는 닿지 않는다. */
const VARIANTS: Variant[] = (() => {
  const out: Variant[] = [];
  for (let k = 1; k <= 12; k++) out.push({ mirror: false, k, flip: false });
  for (let k = 0; k <= 12; k++) out.push({ mirror: false, k, flip: true });
  for (let k = 0; k <= 12; k++) out.push({ mirror: true, k, flip: false });
  for (let k = 0; k <= 12; k++) out.push({ mirror: true, k, flip: true });
  out.push({ mirror: false, k: 0, flip: false }); // 항등.
  return out;
})();

function assertPhaseSafe(blockLen: number, firstTarget: number, firstSrc: number): void {
  if (blockLen % PHASE_PERIOD !== 0) {
    throw new Error(
      `원본 구간 길이 ${blockLen} 이 ${PHASE_PERIOD} 의 배수가 아닙니다 — 페이스 위상이 어긋나 ` +
        `저작된 스톡 장수가 그 레벨의 난이도 목표와 맞지 않게 됩니다.`,
    );
  }
  if ((firstTarget - firstSrc) % PHASE_PERIOD !== 0) {
    throw new Error(`시작 오프셋 ${firstTarget - firstSrc} 이 ${PHASE_PERIOD} 의 배수가 아닙니다.`);
  }
}

/** 원본 이름에서 앞의 "123. " 번호만 떼어낸다(구성 설명은 그대로 물려받는다). */
const nameBody = (n: string): string => n.replace(/^\s*\d+\.\s*/, '');

function makeVariant(src: LevelDoc, level: number, v: Variant): LevelDoc {
  const slots = src.slots.map((s, i) => ({
    ...s,
    id: `cel${level}_${i}`,
    x: v.mirror ? DESIGN_W - s.x : s.x,
  }));
  const deal: Deal = {
    ...src.deal,
    board: src.deal.board.map((r) => mapRank(r, v.k, v.flip)),
    waste: mapRank(src.deal.waste, v.k, v.flip),
    stock: src.deal.stock.map((r) => mapRank(r, v.k, v.flip)),
    ...(src.deal.solution ? { solution: [...src.deal.solution] } : {}),
  };
  const tag = `${v.mirror ? '↔' : ''}${v.flip ? '∓' : ''}${v.k ? `+${v.k}` : ''}`;
  return {
    ...src,
    id: `cel${level}-${level}`,
    level,
    name: `${level}. ${nameBody(src.name)} [${src.level}${tag}]`,
    slots,
    deal,
  };
}

const pack = JSON.parse(fs.readFileSync(PACK, 'utf8')) as { kind?: string; levels: Record<string, LevelDoc> };
const levels = pack.levels;

const blockLen = SRC_TO - SRC_FROM + 1;
const firstTarget = SRC_TO + 1;
assertPhaseSafe(blockLen, firstTarget, SRC_FROM);

const missing: number[] = [];
for (let n = SRC_FROM; n <= SRC_TO; n++) if (!levels[String(n)]) missing.push(n);
if (missing.length) throw new Error(`원본 구간에 빈 레벨: ${missing.join(',')}`);

/**
 * 원본 고르기 — 해답 수순이 없는 원본은 **같은 위상의 대체 원본**(±90)으로 바꾼다.
 *
 * ⚠️ 원본 6판(355·388·391·409·454·472)이 해답 없이 저작돼 있다. 그대로 두면 그 결함이 14배로 번져
 *   **재생 검증이 불가능한 판이 84개** 생긴다(실측 2026-08-30). ±90 은 위상 주기의 정확히 한 배수라
 *   바꿔도 페이스 목표가 그대로다 — 그래서 대체가 안전하다.
 */
const hasSolution = (d: LevelDoc): boolean => Array.isArray(d.deal?.solution) && d.deal.solution.length > 0;
const substituted: string[] = [];
function sourceFor(n: number): LevelDoc {
  const direct = levels[String(n)];
  if (hasSolution(direct)) return direct;
  for (const alt of [n + PHASE_PERIOD, n - PHASE_PERIOD]) {
    if (alt < SRC_FROM || alt > SRC_TO) continue;
    const d = levels[String(alt)];
    if (d && hasSolution(d)) {
      substituted.push(`${n}→${alt}`);
      return d;
    }
  }
  throw new Error(`원본 ${n} 에 해답이 없고 같은 위상(±${PHASE_PERIOD})의 대체 원본도 없습니다.`);
}
const SRC_OF: LevelDoc[] = [];
for (let n = SRC_FROM; n <= SRC_TO; n++) SRC_OF.push(sourceFor(n));

let made = 0;
const reps = new Set<number>();
/** 원본 레벨 번호 → 이미 쓴 편집 조합(대체 때문에 한 원본이 두 자리에서 쓰일 수 있다). */
const usedBySrc = new Map<number, Set<number>>();
for (let level = firstTarget; level <= TARGET_TO; level++) {
  const off = level - firstTarget;
  const src = SRC_OF[off % blockLen];
  const rep = Math.floor(off / blockLen);
  reps.add(rep);
  // 대체된 원본은 두 자리에서 쓰이므로 조합이 겹칠 수 있다 — 아직 안 쓴 조합으로 옮긴다.
  const used = usedBySrc.get(src.level) ?? new Set<number>();
  let vi = rep % VARIANTS.length;
  for (let step = 0; step < VARIANTS.length && used.has(vi); step++) vi = (vi + 1) % VARIANTS.length;
  used.add(vi);
  usedBySrc.set(src.level, used);
  levels[String(level)] = makeVariant(src, level, VARIANTS[vi]);
  made++;
}

// ── 자체 점검 — 파일을 쓰기 전에 가정이 깨졌는지 본다. ──────────────────────────
const problems: string[] = [];
for (let level = firstTarget; level <= TARGET_TO; level++) {
  const d = levels[String(level)];
  const s = SRC_OF[(level - firstTarget) % blockLen];
  if (d.level !== level) problems.push(`${level}: level 필드 불일치`);
  if (d.slots.length !== s.slots.length) problems.push(`${level}: 슬롯 수 불일치`);
  if (d.deal.board.length !== s.deal.board.length) problems.push(`${level}: 보드 장수 불일치`);
  if (d.deal.stock.length !== s.deal.stock.length) problems.push(`${level}: 스톡 장수 불일치`);
  for (const r of [...d.deal.board, ...d.deal.stock, d.deal.waste]) {
    if (!Number.isInteger(r) || r < 1 || r > 13) problems.push(`${level}: 랭크 범위 밖 ${r}`);
  }
  for (const sl of d.slots) {
    if (sl.x < 0 || sl.x > DESIGN_W) problems.push(`${level}: 반전 후 x 가 프레임 밖 ${sl.x}`);
  }
  if (problems.length > 20) break;
}
for (const [srcLevel, used] of usedBySrc) {
  if (used.size > VARIANTS.length) problems.push(`원본 ${srcLevel}: 편집 조합이 모자랍니다`);
}
// 생성된 판이 **서로 다른지** 최종 확인 — 딜 + 기하 지문으로 중복을 센다.
const fp = new Map<string, number>();
for (let level = firstTarget; level <= TARGET_TO; level++) {
  const d = levels[String(level)];
  fp.set(
    JSON.stringify([d.deal.board, d.deal.waste, d.deal.stock, d.slots.map((s) => [s.x, s.y, s.layer])]),
    1 + (fp.get(JSON.stringify([d.deal.board, d.deal.waste, d.deal.stock, d.slots.map((s) => [s.x, s.y, s.layer])])) ?? 0),
  );
}
const dupes = [...fp.values()].filter((c) => c > 1).length;
if (dupes) problems.push(`완전히 같은 판이 ${dupes}쌍 있습니다 — 편집 조합이 모자랍니다`);
// 해답 수순이 없는 생성 레벨은 남으면 안 된다(대체 원본으로 전부 채워져야 한다).
const noSol: number[] = [];
for (let level = firstTarget; level <= TARGET_TO; level++) if (!hasSolution(levels[String(level)])) noSol.push(level);
if (noSol.length) problems.push(`해답 없는 생성 레벨 ${noSol.length}개 (예: ${noSol.slice(0, 5).join(',')})`);

if (problems.length) {
  console.error('❌ 자체 점검 실패:\n  ' + problems.slice(0, 20).join('\n  '));
  process.exit(1);
}

console.log(`원본 ${SRC_FROM}~${SRC_TO} (${blockLen}판) → ${firstTarget}~${TARGET_TO} ${made}판 생성`);
console.log(`반복 ${reps.size}회 · 편집 조합 ${VARIANTS.length}가지 · 완전 중복 0`);
if (substituted.length) console.log(`해답 없는 원본 ${substituted.length}판을 같은 위상으로 대체: ${substituted.join(' ')}`);
console.log(`총 레벨 ${Object.keys(levels).length}`);

if (DRY) {
  console.log('(--dry — 파일을 쓰지 않았습니다)');
} else {
  fs.writeFileSync(PACK, JSON.stringify(pack, null, 2) + '\n');
  console.log(`기록: ${PACK} (${(fs.statSync(PACK).size / 1048576).toFixed(2)}MB)`);
  console.log('다음: npx tsx scripts/replay-solutions.mts  ← 엔진 규칙으로 전 레벨 재생 검증');
}
