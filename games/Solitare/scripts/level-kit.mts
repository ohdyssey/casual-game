/**
 * level-kit.mts — 재사용 가능한 레벨 저작 프리미티브 + 승리딜 베이크(실제 드로우 순서 오라클) 공용 모듈.
 * 44개 참조 이미지를 하나씩 픽셀 디버깅하는 대신, 검증된 3가지 안전 패턴을 파라미터화해 재사용한다.
 */
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealWinnable } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';

export type RawSlot = { x: number; y: number; layer: number };

/** 실제 drawStock() 소비 순서(stock[length-1]부터) 그대로 구현한 승리 경로 탐색기. */
export function solveWitness(board: number[], stock: number[], waste0: number, cov: number[][], cap: number): string[] | null {
  const n = board.length; const cleared = new Array<boolean>(n).fill(false);
  let cc = 0, nodes = 0; const visited = new Set<string>(); const path: string[] = [];
  const adj = (a: number, b: number) => { const d = Math.abs(a - b); return d === 1 || d === 12; };
  const exposed = (i: number) => cov[i].every((c) => cleared[c]);
  const key = (sp: number, w: number) => { let h = ''; for (let i = 0; i < n; i += 4) h += ((cleared[i]?1:0)|(cleared[i+1]?2:0)|(cleared[i+2]?4:0)|(cleared[i+3]?8:0)).toString(16); return h + '|' + sp + '|' + w; };
  function dfs(sp: number, w: number): boolean {
    if (cc === n) return true;
    if (nodes++ > cap) return false;
    const k = key(sp, w); if (visited.has(k)) return false; visited.add(k);
    for (let i = 0; i < n; i++) if (!cleared[i] && adj(board[i], w) && exposed(i)) { cleared[i] = true; cc++; path.push('p' + i); if (dfs(sp, board[i])) return true; cleared[i] = false; cc--; path.pop(); }
    if (sp > 0) { path.push('d'); if (dfs(sp - 1, stock[sp - 1])) return true; path.pop(); }
    return false;
  }
  return dfs(stock.length, waste0) ? path.slice() : null;
}

export interface BakedLevel {
  doc: Record<string, unknown>;
  svg: string;
  openN: number;
  boardN: number;
  stockN: number;
  solMoves: number | null;
}

/**
 * 실제 게임 보드 프레임(PlayScene.ts 실측: BOARD_LEFT=55·BOARD_RIGHT=1025·boardTop≈787·BOARD_BOTTOM=1950)
 * 안에 들어오도록 배치를 **이동만**(스케일 금지) 해서 재중앙한다.
 *
 * ⚠️ 스케일(축소)은 절대 하면 안 된다 — cardBoardToLayout 의 커버 판정은 항상 캔버스 120×164(CANON) 고정
 * 크기로 겹침을 계산하는데, 위치만 축소하면 카드 간격은 좁아지는데 판정 크기는 그대로라 서로 안 겹쳐야 할
 * 카드들이 대량으로 "덮임" 처리되는 버그가 난다(1차 시도에서 확인 — 43~100번 레벨의 오픈 카드수가
 * 46~54장 보드에 3~7장으로 비정상적으로 낮게 나옴). 이동(translation)은 카드 간 상대거리를 보존하므로 안전.
 * 넘치는 경우(need>frame)는 스케일로 억지로 우겨넣지 말고 생성 파라미터(행 간격·crown/foot 게이지) 자체를
 * 줄여서 애초에 프레임 안에 들어오게 만들어야 한다 — 이 함수는 그런 레벨을 콘솔에 경고만 하고 통과시킨다.
 */
const REAL_FRAME = { top: 787, bottom: 1950, left: 55, right: 1025 };
export function fitToFrame(raw: RawSlot[], opts?: { padding?: number; cardW?: number; cardH?: number; label?: string }): RawSlot[] {
  const pad = opts?.padding ?? 24;
  const cw = opts?.cardW ?? 120, ch = opts?.cardH ?? 164;
  const top = REAL_FRAME.top + pad, bottom = REAL_FRAME.bottom - pad;
  const left = REAL_FRAME.left + pad, right = REAL_FRAME.right - pad;
  const minX = Math.min(...raw.map((s) => s.x)) - cw / 2;
  const maxX = Math.max(...raw.map((s) => s.x)) + cw / 2;
  const minY = Math.min(...raw.map((s) => s.y)) - ch / 2;
  const maxY = Math.max(...raw.map((s) => s.y)) + ch / 2;
  const contentW = maxX - minX, contentH = maxY - minY;
  if (contentW > right - left || contentH > bottom - top) {
    console.warn(`⚠️ fitToFrame: "${opts?.label ?? '?'}" 콘텐츠(${Math.round(contentW)}×${Math.round(contentH)})가 프레임(${Math.round(right - left)}×${Math.round(bottom - top)})보다 큼 — 생성 파라미터를 줄여야 함(스케일 안 함, 커버판정 보호).`);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const tcx = (left + right) / 2, tcy = (top + bottom) / 2;
  return raw.map((s) => ({ x: tcx + (s.x - cx), y: tcy + (s.y - cy), layer: s.layer }));
}

/** raw(x,y,layer) 슬롯 목록 → coveredBy 계산 → 승리 가능(실제 순서 검증) 딜 반복 탐색 → 문서+SVG. */
export function bakeLevel(opts: {
  id: string; name: string; level: number; raw: RawSlot[];
  seedStart?: number; stockCandidates?: number[]; seedTries?: number; solveCap?: number;
}): BakedLevel {
  const { id, name, level } = opts;
  const raw = fitToFrame(opts.raw, { label: `lv${level} ${name}` });
  const seedStart = opts.seedStart ?? 1000 + level * 37;
  // "뽑기 여유가 너무 많아 그냥 진행해도 무조건 이긴다" 피드백 — 넉넉한 쪽(0.7~1.4배)부터 찾던 이전 방식을
  // 뒤집어 **풀리는 최소 스톡에 아주 작은 여유만** 얹는다(아슬아슬하게 이길 정도). 오름차순으로 가장 작은
  // 후보부터 시도해 처음 풀리는 스톡을 채택 — 이전 "최소=승률붕괴" 문제는 최소치를 그대로 썼기 때문이라
  // 이번엔 최소보다 살짝 위(0.4배 등)부터 단계적으로 시도해 완전히 제로 여유는 피한다.
  const stockCandidates = opts.stockCandidates ?? [
    Math.max(6, Math.round(raw.length * 0.32)),
    Math.round(raw.length * 0.38),
    Math.round(raw.length * 0.45),
    Math.round(raw.length * 0.55),
    Math.round(raw.length * 0.65), // 위 4개가 다 실패하면 관대한 폴백(dealWinnable 기본치)으로 새는 걸 막는 안전망.
  ];
  const seedTries = opts.seedTries ?? 30;
  const solveCap = opts.solveCap ?? 600_000;

  const slots = raw.map((s, i) => ({ id: `${id}_${i}`, x: Math.round(s.x), y: Math.round(s.y), layer: s.layer, rot: 0 }));
  const bareDoc = { schemaVersion: 1, kind: 'cardBoard', id, card: { w: 120, h: 164 }, slots } as unknown as CardBoardDoc;
  const layout0 = cardBoardToLayout(bareDoc, id);
  const coveredIds = new Set(layout0.slots.filter((s) => s.coveredBy.length > 0).map((s) => s.id));
  const openN = slots.length - coveredIds.size;
  const withFace = slots.map((s) => ({ ...s, face: coveredIds.has(s.id) ? 'fold' : 'open' }));

  const layout = cardBoardToLayout({ ...bareDoc, slots: withFace } as CardBoardDoc, id);
  const idx = new Map(layout.order.map((sid, i) => [sid, i]));
  const cov = layout.order.map((sid) => layout.slots.find((q) => q.id === sid)!.coveredBy.map((c) => idx.get(c)!));

  let st: ReturnType<typeof dealWinnable> | null = null;
  let sol: string[] | null = null;
  outer: for (const startStock of stockCandidates) {
    for (let seed = seedStart; seed < seedStart + seedTries; seed++) {
      const cand = dealWinnable(layout, seededRng(seed), 40, { startStock, ease: 0 });
      const board = layout.order.map((sid) => cand.board[sid].rank);
      const stock = cand.stock.map((c) => c.rank);
      const waste = cand.waste[0].rank;
      const found = solveWitness(board, stock, waste, cov, solveCap);
      if (found) { st = cand; sol = found; break outer; }
    }
  }
  if (!st) st = dealWinnable(layout, seededRng(seedStart), 300);

  const doc: Record<string, unknown> = {
    schemaVersion: 1, kind: 'cardBoard', id: `${id}-${level}`, name, level,
    frame: { designW: 1080, designH: 2400 }, card: { w: 120, h: 164 },
    budget: { board: slots.length, stock: st.stock.length }, difficulty: { target: 1 },
    deal: {
      board: layout.order.map((sid) => st!.board[sid].rank),
      waste: st.waste[0].rank,
      stock: st.stock.map((c) => c.rank),
      ...(sol ? { solution: sol } : {}),
    },
    slots: withFace,
  };

  const sorted = [...withFace].sort((a, b) => a.layer - b.layer);
  let r = '';
  for (const s of sorted) {
    const o = !coveredIds.has(s.id);
    r += `<g transform="translate(${s.x} ${s.y})"><rect x="-60" y="-82" width="120" height="164" rx="12" fill="${o ? '#fff' : 'hsl(210,72%,62%)'}" stroke="${o ? '#e0453e' : '#2a5a9a'}" stroke-width="3"/><text y="12" font-size="30" text-anchor="middle" fill="${o ? '#333' : '#eaf3ff'}">${s.layer}</text></g>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="1200" viewBox="0 0 1080 2400"><rect width="1080" height="2400" fill="#20263a"/><text x="30" y="60" fill="#fff" font-size="36">${level}. ${name} (${slots.length}·오픈${openN})</text>${r}</svg>`;

  return { doc, svg, openN, boardN: slots.length, stockN: st.stock.length, solMoves: sol ? sol.length : null };
}

// ─────────────────────────────────────────────────────────────────────────
// 프리미티브: 3가지 검증된 안전 패턴을 파라미터화.
// ─────────────────────────────────────────────────────────────────────────

/** 컬럼 스택 — 열마다 독립된 세로 미니스택. 뒤쪽 카드일수록 위로 peek(dy)+살짝 지그재그(fan)로 어긋나게
 *  쌓아 실제 카드더미처럼 여러 장 모서리가 겹쳐 보이게 한다(완전 동일좌표 겹침 지양 — "너무 단순함" 피드백).
 *  열 간격≥140(카드폭120+fan여유20) 이면 열끼리 절대 안 겹침 → 기하 안전. */
export function columnStacks(depths: number[], opts?: { spacing?: number; y0?: number; dy?: number; fan?: number; centerX?: number }): RawSlot[] {
  // 실제 보드폭(BOARD_LEFT=55~BOARD_RIGHT=1025, 970px, PlayScene.ts)에 지그재그(fan) 최대폭까지 포함해도
  // 안전마진(40px)이 남도록 역산 — 예전엔 디자인 캔버스 전체(1080)를 기준으로 잘못 계산해 실제로는 초과했음.
  const spacing = opts?.spacing ?? Math.min(160, 752 / Math.max(1, depths.length - 1));
  const cx = opts?.centerX ?? 540;
  const startX = cx - ((depths.length - 1) * spacing) / 2;
  const y0 = opts?.y0 ?? 1200;
  const dy = opts?.dy ?? 20;
  // 열 간격에서 안전마진(카드폭120 겹침선 기준 -2px 여유)을 자동 역산해 지그재그 폭을 절대 못 넘게 캡.
  const safeMargin = Math.max(0, (spacing - 120) / 2 - 2);
  const fan = Math.min(opts?.fan ?? 9, safeMargin);
  const out: RawSlot[] = [];
  depths.forEach((depth, c) => {
    for (let d = 0; d < depth; d++) {
      const zig = d === 0 ? 0 : (d % 2 === 0 ? 1 : -1) * Math.min(d, 3) * (fan / 3);
      out.push({ x: startX + c * spacing + zig, y: y0 - d * dy, layer: depth - d });
    }
  });
  return out;
}

/** 십자뭉치(버스트/링) — front(중앙) + top/upperL/upperR/lowerL/lowerR 5장. front·top 레이어를 스왑하면
 *  "오픈 링 + 덮인 코어"(ring) 도 같은 기하로 만들 수 있다. 클러스터 간 x 간격≥300 이면 서로 안 섞임. */
export function crossCluster(opts?: { openFront?: boolean }): RawSlot[] {
  const openFront = opts?.openFront ?? true;
  const frontLayer = openFront ? 5 : 1;
  const backLayer = openFront ? 1 : 5;
  const sideLayer = 3;
  return [
    { x: 0, y: -140, layer: backLayer },   // top
    { x: -90, y: -70, layer: sideLayer },  // upperLeft
    { x: 90, y: -70, layer: sideLayer },   // upperRight
    { x: -90, y: 100, layer: sideLayer },  // lowerLeft
    { x: 90, y: 100, layer: sideLayer },   // lowerRight
    { x: 0, y: 0, layer: frontLayer },     // front/center
  ];
}

/** crossCluster 여러 개를 가로로 나열(중심 x 지정). */
export function tileClusters(clusterXs: number[], y0: number, opts?: { openFront?: boolean }): RawSlot[] {
  const out: RawSlot[] = [];
  for (const cx of clusterXs) for (const s of crossCluster(opts)) out.push({ x: cx + s.x, y: y0 + s.y, layer: s.layer });
  return out;
}

/** 한 줄 오픈 로우 — coveredAt 인덱스만 뒤에 카드 1장을 겹쳐 덮음(트리비얼 초반 레벨용). */
export function openRow(n: number, coveredAt: number[] = [], opts?: { spacing?: number; y0?: number; centerX?: number }): RawSlot[] {
  // 실제 보드폭(970) 기준 안전마진 40px 역산(columnStacks 와 동일 근거).
  const spacing = opts?.spacing ?? Math.min(130, 770 / Math.max(1, n - 1));
  const cx = opts?.centerX ?? 540;
  const startX = cx - ((n - 1) * spacing) / 2;
  const y0 = opts?.y0 ?? 1200;
  const out: RawSlot[] = [];
  for (let i = 0; i < n; i++) {
    const covered = coveredAt.includes(i);
    out.push({ x: startX + i * spacing, y: y0, layer: covered ? 2 : 3 });
    if (covered) out.push({ x: startX + i * spacing, y: y0 - 10, layer: 1 });
  }
  return out;
}

/** 리지(발리필) — 열 프로필(col,row,layer)을 직접 지정. arch 레벨(build-arch-level.mts)과 동일 격자 관용구
 *  (px=128,py=86)를 재사용 — 이미 겹침 안전성이 검증된 패턴이라 재파생 없이 재사용한다. */
export function ridgeFromProfile(profile: { col: number; row: number; layer: number }[], opts?: { px?: number; py?: number; centerX?: number; y0?: number }): RawSlot[] {
  const px = opts?.px ?? 128, py = opts?.py ?? 86;
  const cx = opts?.centerX ?? 540, y0 = opts?.y0 ?? 940;
  return profile.map((p) => ({ x: cx + p.col * px, y: y0 + p.row * py, layer: p.layer }));
}


/** ringCols(안쪽→바깥쪽 오픈 피크 열) → 피크+갭 발리필 커버. buildRidge 와 동일 규칙(모든 레벨 스크립트 공용). */
function ringToProfile(ringCols: number[][]): { col: number; row: number; layer: number }[] {
  const out: { col: number; row: number; layer: number }[] = [];
  const peaks: { col: number; row: number }[] = [];
  ringCols.forEach((cols, row) => { for (const col of cols) { out.push({ col, row, layer: 5 }); peaks.push({ col, row }); } });
  peaks.sort((a, b) => a.col - b.col);
  for (let i = 0; i < peaks.length - 1; i++) {
    const a = peaks[i], b = peaks[i + 1];
    const gap = b.col - a.col;
    if (gap <= 0.05) continue;
    const midCol = (a.col + b.col) / 2;
    const midRow = a.row === b.row ? a.row + 1 : Math.max(a.row, b.row);
    out.push({ col: midCol, row: midRow, layer: 4 });
  }
  return out;
}

/** 본체 위(크라운)·아래(풋)에 작은 발리필 뭉치를 추가로 얹는다 — 본체와 y 간격을 넉넉히 띄워(카드높이164
 *  이상) 겹침 위험 없이 "중앙에만 뭉쳐있다" 피드백을 해소(세로 전체를 더 쓰도록 카드 20%가량 추가확장). */
export function withCrownFoot(raw: RawSlot[], opts?: { centerX?: number; crownRatio?: number; footRatio?: number; minTotal?: number }): RawSlot[] {
  const n = raw.length;
  const cx = opts?.centerX ?? 540;
  const minY = Math.min(...raw.map((s) => s.y));
  const maxY = Math.max(...raw.map((s) => s.y));
  const crownTarget = Math.max(3, Math.round(n * (opts?.crownRatio ?? 0.13)));
  // 각 티어 최대 열(col) 값을 실제 보드폭(970) 기준 안전마진 40px 이상 남도록 확인된 값만 사용
  // (예전 [-3.3,3.3] 티어는 여백 2px뿐이라 경계 근처 반올림에도 넘칠 수 있어 [-3,3]으로 하향).
  const crownRing =
    crownTarget <= 5 ? [[-0.5, 0.5]] :
    crownTarget <= 10 ? [[-0.5, 0.5], [-1.6, 1.6]] :
    crownTarget <= 14 ? [[-0.6, 0.6], [-1.8, 1.8], [-2.9, 2.9]] :
    [[-1, 0, 1], [-2, 2], [-2.9, 2.9]];
  // 크라운 최대 3개 행(row0~2, 내부 행간격 65) 깊이만큼만 안전 여백 두고 본체 바로 위에 배치
  // (예전 고정 460+행간격86 은 불필요하게 커서 세로 프레임을 자주 넘겼음 — 축소는 커버판정을 깨서 금지,
  //  그래서 애초에 필요한 만큼만 띄운다).
  const crown = ridgeFromProfile(ringToProfile(crownRing), { centerX: cx, y0: minY - 300, py: 65 });
  // 소량/대형 레벨 목표치까지 — 로우를 계속 새로 쌓으면(각 175px) 세로를 금방 다 써버려 프레임을 넘긴다.
  // 컬럼스택처럼 "같은 자리에 깊이로" 쌓아(dy=14, 1장당 14px) 훨씬 좁은 세로폭 안에 훨씬 많은 카드를 채운다.
  const minTotal = opts?.minTotal ?? 24;
  const footRatioTarget = Math.max(3, Math.round(n * (opts?.footRatio ?? 0.07)));
  const footTarget = Math.max(footRatioTarget, minTotal - n - crown.length);
  let foot: RawSlot[] = [];
  if (footTarget >= 1) {
    const nCols = Math.min(8, Math.max(3, Math.ceil(footTarget / 6)));
    const base = Math.floor(footTarget / nCols);
    const rem = footTarget % nCols;
    const depths = Array.from({ length: nCols }, (_, i) => Math.max(1, base + (i < rem ? 1 : 0)));
    const maxDepth = Math.max(...depths);
    const footDy = 14;
    const footY0 = maxY + 150 + (maxDepth - 1) * footDy;
    foot = columnStacks(depths, { centerX: cx, y0: footY0, dy: footDy });
  }
  return [...raw, ...crown, ...foot];
}
