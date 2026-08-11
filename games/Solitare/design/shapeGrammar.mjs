/**
 * shapeGrammar.mjs — **레벨 배치 부품 문법**(샘플 LevelData 44장 분석 기반).
 *
 * 샘플에서 추출한 구조 원리:
 *   ① 레벨 = **부품(primitive) 2~5개의 조합**  ② **좌우 대칭이 지배적**(mirrorX)
 *   ③ 부품 = 오버랩 체인(뒤 fold → 앞 open 순차 공개)  ④ 회전(팬/호)이 핵심 시각 요소
 *   ⑤ 부품끼리 떨어진 '섬' 구성도 흔함(완전 연결 불필요)
 *
 * 부품(로컬 좌표, 카드 120×164 기준) → {x,y,layer,rot}[] 를 방출.
 *   커버 규칙(게임과 동일): 겹침 ≥1%+높은 layer(또는 같은 layer 뒤 인덱스)=앞. 같은 layer 이웃은
 *   15% 미만 겹침이어야 서로 안 가림 → 같은 행 카드는 pitch ≥ 104 유지.
 *
 * 에디터(classic script)와 노드 생성기가 **동일 파일**을 사용한다(ESM export + window 전역 겸용).
 */

const CW = 120;
const CH = 164;

/** 수직 오버랩 기둥(샘플 #4·#18·#43) — 뒤(위) fold 체인, 앞(아래)=open. */
export function stripV(n = 4, pitch = 46) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: 0, y: i * pitch, layer: i, rot: 0 });
  return out;
}

/** 가로 오버랩 줄(샘플 #9·#29) — dir=1 이면 오른쪽 카드가 앞. */
export function stripH(n = 5, pitch = 56, dir = 1) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: i * pitch * dir, y: 0, layer: i, rot: 0 });
  return out;
}

/** 부채(샘플 #8·#15·#25) — 아래 피벗 기준 회전 부채. 중앙 카드가 가장 앞. */
export function fan(n = 5, spreadDeg = 70, radius = 210) {
  const out = [];
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const a = ((i - mid) / Math.max(1, n - 1)) * spreadDeg;
    const rad = (a * Math.PI) / 180;
    out.push({
      x: Math.sin(rad) * radius,
      y: -(1 - Math.cos(rad)) * radius * 0.9, // 위로 벌어지는 부채(샘플 #15)
      layer: n - Math.round(Math.abs(i - mid)), // 중앙이 최상(앞).
      rot: a,
    });
  }
  return out;
}

/** 완만한 호 줄(샘플 #34·#9) — sag>0 이면 아래로 처진 미소 곡선, 카드가 기울기를 따라 회전. */
export function arcRow(n = 7, chord = 640, sag = 70, frontCenter = true) {
  const out = [];
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i - mid) / mid; // -1..1
    out.push({
      x: t * (chord / 2),
      y: sag * t * t,
      layer: frontCenter ? n - Math.round(Math.abs(i - mid)) : i,
      rot: t * Math.min(24, sag * 0.35),
    });
  }
  return out;
}

/** 클래식 피라미드(샘플 #19·#38) — rows행, 아랫행이 앞(윗행을 가림). */
export function pyramid(rows = 3, pitchX = 124, pitchY = 86) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= r; c++) {
      out.push({ x: (c - r / 2) * pitchX, y: r * pitchY, layer: r, rot: 0 });
    }
  }
  return out;
}

/** 역피라미드(샘플 #41) — 위가 넓고 아래 꼭짓점이 앞. */
export function invPyramid(rows = 3, pitchX = 124, pitchY = 86) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    const cnt = rows - r;
    for (let c = 0; c < cnt; c++) {
      out.push({ x: (c - (cnt - 1) / 2) * pitchX, y: r * pitchY, layer: r, rot: 0 });
    }
  }
  return out;
}

/** 다이아 링(샘플 #14) — 타원 위 n장, 바깥쪽 45° 기울임, 홀짝 층 교차(이웃 절반이 앞). */
export function diamondRing(n = 8, rx = 195, ry = 145) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    out.push({
      x: Math.cos(a) * rx,
      y: Math.sin(a) * ry,
      layer: i % 2, // 교차 겹침 룩.
      rot: (Math.cos(a) > 0 ? 1 : -1) * 16, // 바깥쪽 살짝 기울임(뭉개짐 방지).
    });
  }
  return out;
}

/** 벽돌 벽(샘플 #6·#12) — rows×cols, 행마다 반 칸 오프셋, 아랫행이 앞. */
export function wall(rows = 2, cols = 6, pitchX = 124, pitchY = 88) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (pitchX / 2);
    for (let c = 0; c < cols - (r % 2); c++) {
      out.push({ x: c * pitchX + off - ((cols - 1) * pitchX) / 2, y: r * pitchY, layer: r, rot: 0 });
    }
  }
  return out;
}

/** 게이트(샘플 #31·#22) — 기둥 2개 + 위 크로스바(크로스바가 기둥 머리를 가림). */
export function gate(colH = 3, span = 250, pitch = 48) {
  const out = [];
  for (const sx of [-span / 2, span / 2]) {
    for (let i = 0; i < colH; i++) out.push({ x: sx, y: i * pitch, layer: i, rot: 0 });
  }
  // 크로스바(가로 2~3장) — 기둥 꼭대기(y=0)를 덮는 최상층.
  const barN = span > 320 ? 3 : 2;
  for (let i = 0; i < barN; i++) {
    out.push({ x: (i - (barN - 1) / 2) * Math.min(124, span / barN), y: -CH * 0.42, layer: colH + 1, rot: 0 });
  }
  return out;
}

/** 사선 스트립(샘플 #44 A/V 프레임) — dir=1 우하향. 아래 끝이 앞. */
export function diagStrip(n = 4, stepX = 58, stepY = 64, dir = 1) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: i * stepX * dir, y: i * stepY, layer: i, rot: dir * 14 });
  return out;
}

/** 로제트(샘플 #42) — 중심 겹침 방사. */
export function rosette(n = 6, radius = 60) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360;
    const rad = (a * Math.PI) / 180;
    out.push({ x: Math.sin(rad) * radius, y: -Math.cos(rad) * radius * 0.7, layer: i, rot: a > 180 ? a - 360 : a });
  }
  return out;
}

/** 같은 층 **오픈 줄**(샘플 #11·#12) — 겹침 없는 가로줄, 전부 동시 노출(넓은 선택지). */
export function openRow(n = 6, pitch = 128) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: (i - (n - 1) / 2) * pitch, y: 0, layer: 0, rot: 0 });
  return out;
}

/** **스택 줄** — 짧은 기둥(2~4장) 여러 개: 기둥마다 앞카드가 열려 동시 오픈 폭을 만든다. */
export function stackRow(cols = 5, h = 3, gapX = 150, pitch = 46) {
  let out = [];
  for (let i = 0; i < cols; i++) out = out.concat(place(stripV(h, pitch), (i - (cols - 1) / 2) * gapX, 0, 0));
  return out;
}

/** 부품 카탈로그(에디터 탭·자동 설계 공용). */
export const PARTS = { stripV, stripH, fan, arcRow, pyramid, invPyramid, diamondRing, wall, gate, diagStrip, rosette, openRow, stackRow };

// ── 배치 헬퍼 ──────────────────────────────────────────────────────────────
/** 부품을 (cx,cy)에 배치(+층 오프셋). */
export function place(slots, cx, cy, layerBase = 0) {
  return slots.map((s) => ({ ...s, x: s.x + cx, y: s.y + cy, layer: s.layer + layerBase }));
}
/** 좌우 대칭 복제(캔버스 중심 mx) — 회전도 반전. */
export function mirrorX(slots, mx = 540) {
  return slots.map((s) => ({ ...s, x: 2 * mx - s.x, rot: -(s.rot ?? 0) }));
}
/** 전체 bbox 를 보드 영역에 맞춰 평행이동+필요 시 축소(위치만 스케일, 카드 크기 불변). */
// 보드 표시 영역(게임 BOARD_TOP=680·BOARD_BOTTOM=1950 기준) — **상단 여백을 확보하고 배치를 살짝 아래로**
//   (요청 2026-07-18): y0 를 늘려 상단 공백을 확실히 두되, 작업 높이(y1-y0)는 이전보다 줄여 상하 간격이
//   과하게 벌어지지 않게 한다. 중심(ty=(y0+y1)/2)이 자연히 아래로 이동해 "보드 중심에 배치"를 만족.
export function fitToBoard(slots, area = { x0: 96, x1: 984, y0: 850, y1: 1900 }) {
  if (!slots.length) return slots;
  const xs = slots.map((s) => s.x);
  const ys = slots.map((s) => s.y);
  const minX = Math.min(...xs) - CW / 2;
  const maxX = Math.max(...xs) + CW / 2;
  const minY = Math.min(...ys) - CH / 2;
  const maxY = Math.max(...ys) + CH / 2;
  // **축별 독립 스케일(2026-07-17 핵심 수정)** — 세로 축소가 가로 pitch 까지 줄여 같은 행 카드가
  //   겹치던(오픈 소실·뭉침) 문제 제거. 가로/세로 각각 넘칠 때만 그 축으로만 축소.
  const kx = Math.min(1, (area.x1 - area.x0) / Math.max(1, maxX - minX));
  const ky = Math.min(1, (area.y1 - area.y0) / Math.max(1, maxY - minY));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const tx = (area.x0 + area.x1) / 2;
  const ty = (area.y0 + area.y1) / 2; // 세로 중앙 앵커(중앙 밀집).
  return slots.map((s) => ({ ...s, x: Math.round(tx + (s.x - cx) * kx), y: Math.round(ty + (s.y - cy) * ky) }));
}

// ── 자동 설계(스켈레톤 조합) ──────────────────────────────────────────────
/**
 * 스켈레톤 = 샘플에서 관찰된 **전형 구도**. budget(카드 수)과 rng 로 부품 파라미터를 채워
 * 슬롯(절대좌표) 배열을 만든다. 전부 좌우 대칭 or 중앙 대칭 구도.
 */
export const SKELETONS = [
  // **설계 원칙 v4(2026-07-18)**: "뽑기를 너무 많이 뽑으면 재미없다" 피드백 — v3(오픈 폭 5~9 고정,
  //   초과 예산은 깊이로만 흡수)는 대형 보드(예산 54)에서도 오픈이 6~9로 그대로라 카드 대부분이 단선
  //   체인에 깊이 묻혀, 그 체인이 막히면 뽑기에 의존할 수밖에 없었다. **오픈 폭이 예산(budget)에 비례해
  //   같이 늘어나도록** 초과 예산을 병렬 열(stackRow)로 흡수 — 기둥/부채 수 자체를 budget 에 맞춰 늘리거나,
  //   남는 예산을 단일 체인이 아닌 여러 짧은 병렬 기둥으로 배치한다. 파트가 서로 침범하지 않게 밴드 y 를
  //   파트 높이에 맞춰 배치(뭉침 방지)·좌우 대칭 유지는 v3 그대로.
  {
    id: 'columnsBar', // 통기둥 5~7개(예산에 비례해 열 자체가 늘어남) + 크라운 호 — 오픈 = 기둥수+1.
    build(budget) {
      // ⚠️ **열 상한은 7까지만**(2026-07-18 발견) — 보드 폭(x0..x1=888px, 카드 120px)에 7 초과로
      //   넣으면 fitToBoard 압축 후 실효 pitch 가 카드 폭 밑으로 떨어져 인접 기둥끼리 서로 가려버리고
      //   (모든 기둥이 layerBase=0 공유 → 동일 층끼리 겹치면 전부 가려짐), 오픈이 2장까지 붕괴한다
      //   (lv406 실측: 8열 시도 시 오픈 8→2). 7열이면 압축 후에도 pitch>카드폭 여유가 있어 안전.
      const cols = Math.min(7, Math.max(5, Math.round(budget / 7))); // 24장→5열, 54장→7열.
      const h = Math.max(4, Math.round((budget - cols) / cols));
      const gapX = Math.min(172, 880 / (cols - 1));
      let s = [];
      for (let i = 0; i < cols; i++) s = s.concat(place(stripV(h, 52), 540 + (i - (cols - 1) / 2) * gapX, 950, 0));
      s = s.concat(place(arcRow(5, 380, 26, true), 540, 950 - CH * 0.62, h + 2)); // 촘촘한 크라운(체인 1오픈)
      return s;
    },
  },
  {
    id: 'twinFans', // 상단 쌍부채(오픈2) + 중단 오픈줄(4) + 하단 병렬기둥 쌍 = 예산에 비례해 오픈 증가.
    build(budget) {
      const fn = Math.max(5, Math.round((budget - 12) / 2.4));
      const f = place(fan(fn, 60 + Math.min(24, fn * 2), 210), 300, 950, 0);
      let s = f.concat(mirrorX(f));
      s = s.concat(place(openRow(4, 132), 540, 1310, fn + 3));
      const rest = Math.max(3, budget - s.length);
      // 단일 체인(stripV) 대신 병렬 기둥 묶음(stackRow) — 예산이 클수록 열이 늘어 오픈 폭도 함께 늘어난다.
      const cols = Math.min(3, Math.max(1, Math.round(rest / 2 / 6)));
      const h = Math.max(2, Math.ceil(rest / 2 / cols));
      const c = place(stackRow(cols, h, 60, 50), 320, 1520, 0);
      s = s.concat(c, mirrorX(c));
      return s;
    },
  },
  {
    id: 'wallTips', // 상단 기둥1+봉우리(오픈3) + 하단 벽(6) = 9.
    build(budget) {
      const rows = budget >= 40 ? 3 : 2;
      let s = place(wall(rows, 6), 540, 1420, 0);
      s = s.concat(place(pyramid(2), 540, 860, 0));
      const rest = budget - s.length;
      // **좌우 보조를 병렬 기둥 묶음(stackRow)으로**(2026-07-18) — 예전엔 단일 체인(stripV) 2개뿐이라
      //   후반부에 동시 오픈이 2장으로 좁아지는 단선 구조였다(대형 보드일수록 여기로 예산이 많이 몰림).
      //   좌우 각 2~3열 병렬 기둥으로 바꿔 후반에도 최소 4장 이상 열리게 한다.
      if (rest >= 4) {
        const perSide = Math.ceil(rest / 2);
        const cols = Math.min(3, Math.max(2, Math.round(perSide / 5)));
        const h = Math.max(2, Math.ceil(perSide / cols));
        s = s.concat(place(stackRow(cols, h, 62, 46), 210, 800, 0), place(stackRow(cols, h, 62, 46), 870, 800, 0));
      }
      return s;
    },
  },
  {
    id: 'gatesRow', // 게이트쌍(오픈 4×2=8) — 남는 예산은 기둥을 아래로 연장(오픈 불변).
    build(budget) {
      const g1 = place(gate(3, 260), 300, 880, 0);
      let s = g1.concat(mirrorX(g1));
      let rest = budget - s.length;
      // 연장: 게이트 기둥 아래로 체인 계속(x 동일·아래로, 층은 위(front))
      const xs = [300 - 130, 300 + 130, 780 - 130, 780 + 130];
      let k = 0;
      while (rest > 0) {
        const x = xs[k % 4];
        const depth = Math.floor(k / 4) + 1;
        s.push({ x, y: 880 + 2 * 48 + depth * 52, layer: 3 + depth, rot: 0 });
        rest--; k++;
      }
      return s;
    },
  },
  {
    id: 'diamondTwins', // 다이아링 쌍(오픈 4×2=8) + 중앙 기둥(1) = 9.
    build(budget) {
      const r1 = place(diamondRing(8, 180, 138), 270, 940, 0).concat(place([{ x: 0, y: 0, layer: 3, rot: 0 }], 270, 940, 0));
      let s = r1.concat(mirrorX(r1));
      // **병렬 기둥 묶음으로 예산 전량 소화**(2026-07-18) — 예전엔 stripV 1개(단선)에 10장 상한이 있어
      //   고예산(54장)에서도 보드가 28장에서 멈췄다(500레벨까지 확장한 난이도 곡선과 어긋남).
      const rest = Math.max(3, budget - s.length);
      // 열은 최대 3(오픈 상한 준수 — 다이아링 자체 오픈 8 + 이 열들의 오픈이 10을 넘지 않게), 깊이로 예산 흡수.
      const cols = Math.min(3, Math.max(2, Math.round(rest / 8)));
      const h = Math.max(2, Math.ceil(rest / cols));
      s = s.concat(place(stackRow(cols, h, Math.min(160, 880 / (cols - 1 || 1)), 50), 540, 1330, 6));
      return s;
    },
  },
  {
    id: 'smileArc', // 스마일 호 기둥 7개(오픈7) + 상단 병렬기둥(예산에 비례) = 예산이 클수록 오픈도 늘어남.
    build(budget) {
      const cols = 7;
      const h = Math.max(3, Math.round((budget - 4) / cols));
      let s = [];
      for (let i = 0; i < cols; i++) {
        const t = (i - (cols - 1) / 2) / ((cols - 1) / 2);
        s = s.concat(place(stripV(h, 48).map((q) => ({ ...q, rot: t * 14 })), 540 + t * 395, 1330 + 115 * t * t, 0));
      }
      const rest = Math.max(3, budget - s.length);
      // 단일 중앙 기둥 대신 병렬 기둥 묶음 — 남는 예산이 커질수록 열도 늘어 오픈 폭이 함께 커진다.
      const topCols = Math.min(3, Math.max(1, Math.round(rest / 6)));
      s = s.concat(place(stackRow(topCols, Math.max(2, Math.ceil(rest / topCols)), 90, 50), 540, 830, cols + 2));
      return s;
    },
  },
  {
    id: 'vFrames', // A프레임 쌍(4) + 중앙 기둥(1) + 하단 스택줄(4~6) = 9~11 오픈(진행 폭 유지).
    build(budget) {
      const n = Math.min(5, Math.max(4, Math.round((budget - 14) / 4.4)));
      const L = place(diagStrip(n, 54, 58, 1), 215, 830, 0);
      const L2 = place(diagStrip(n, -54, 58, -1), 215 + n * 54 + 124, 830, 0);
      let s = L.concat(L2, mirrorX(L), mirrorX(L2));
      s = s.concat(place(stripV(3, 50), 540, 1120, n + 3));
      const rest = Math.max(4, budget - s.length);
      const cols = Math.min(6, Math.max(4, Math.round(rest / 3)));
      s = s.concat(place(stackRow(cols, Math.max(2, Math.ceil(rest / cols)), Math.min(170, 840 / (cols - 1)), 48), 540, 1620, n + 20));
      return s;
    },
  },
  {
    id: 'pyramidTrio', // 크라운 삼봉(7) + 하단 스택줄(4~6) = 11~13 오픈. 진행 내내 넓게.
    build(budget) {
      let s = place(pyramid(3), 540, 830, 0);
      s = s.concat(place(pyramid(2), 190, 916, 0), place(pyramid(2), 890, 916, 0));
      const rest = Math.max(4, budget - s.length);
      const cols = Math.min(6, Math.max(4, Math.round(rest / 3)));
      s = s.concat(place(stackRow(cols, Math.max(2, Math.ceil(rest / cols)), Math.min(175, 860 / (cols - 1)), 50), 540, 1560, 6));
      return s;
    },
  },
  {
    id: 'rosetteCrown', // 로제트(1) + 4귀 부채(4) + 하단 쌍기둥(2) = 7. 부채 장수로 예산 소화.
    build(budget) {
      let s = place(rosette(7, 64), 540, 1160, 40);
      const fn = Math.max(4, Math.round((budget - 13) / 4));
      const f1 = place(fan(fn, 46, 190), 255, 820, 0);
      const f2 = place(fan(fn, 46, 190), 255, 1560, 0);
      s = s.concat(f1, mirrorX(f1), f2, mirrorX(f2));
      const rest = budget - s.length;
      if (rest >= 2) {
        // 단일 체인 대신 병렬 기둥 묶음 — 남는 예산이 커질수록 열도 늘어 오픈 폭이 함께 커진다.
        const cols = Math.min(3, Math.max(1, Math.round(rest / 2 / 6)));
        const c = place(stackRow(cols, Math.max(2, Math.ceil(rest / 2 / cols)), 70, 50), 460, 1660, 0);
        s = s.concat(c, mirrorX(c));
      }
      return s;
    },
  },
];

/** 밴드 압축(중심 밀집) — 세로 클러스터(밴드) 사이 빈 공간을 감지해 밀착 수준으로 접는다(v1·v2 공용). */
function compactBands(s) {
  const uy = [...new Set(s.map((p) => Math.round(p.y)))].sort((a, b) => a - b);
  const bands = [];
  let cur = [uy[0]];
  for (let i = 1; i < uy.length; i++) {
    if (uy[i] - uy[i - 1] > 190) { bands.push(cur); cur = []; }
    cur.push(uy[i]);
  }
  bands.push(cur);
  if (bands.length > 1) {
    const shift = new Map();
    let base = bands[0][bands[0].length - 1];
    for (let b = 1; b < bands.length; b++) {
      const delta = base + 172 - bands[b][0];
      for (const y of bands[b]) shift.set(y, delta);
      base = bands[b][bands[b].length - 1] + delta;
    }
    s = s.map((p) => (shift.has(Math.round(p.y)) ? { ...p, y: p.y + shift.get(Math.round(p.y)) } : p));
  }
  return s;
}

/** 자동 설계 — level 시드 결정적: 스켈레톤 로테이션 + budget 채움 + 보드 fit. slots(절대좌표) 반환. */
export function composeLevel(level, budget, rngSeedFn, relax = 1) {
  const rnd = rngSeedFn ?? mulberry32(level * 2654435761 + 7);
  const sk = SKELETONS[(level - 1) % SKELETONS.length];
  // **레벨별 변주(고유성)** — 커버/오픈 지표를 바꾸지 않는 **불변 변환만** 사용:
  //   주기 홀수=좌우 반전 + 시드 평행이동(±24/±20px). 예산·스케일 변주는 금지(지표 붕괴 이력).
  let s = sk.build(budget, rnd);
  if (Math.floor((level - 1) / SKELETONS.length) % 2 === 1) s = mirrorX(s);
  // (2026-07-18) 균등 y-압축 제거 — 링/피라미드/사선 파트의 내부 피치를 뭉개 커버 구조를 파괴했음.
  //   밀도는 **밴드 밀착(compactBands)** 이 담당한다. 파트 내부 기하는 설계값 그대로 보존.
  const slots = fitToBoard(compactBands(s));
  return slots.map((q, i) => ({ id: `c${i}`, x: q.x, y: q.y, layer: q.layer, face: 'fold', rot: Math.round(q.rot ?? 0) }));
}

// ════════════════════════════════════════════════════════════════════════════
// ── v2 문법(2026-07-19) — **오픈 확장(Expanding Frontier) 원리** ─────────────
//
// 참조 44장 재분석(심화)의 결론: 좋은 판의 본질은 실루엣(모양)이 아니라 **커버 토폴로지**다.
//   · 참조작 블록셀은 앞 카드 1장이 뒤 2~3장을 덮는 **트리/격자**(fan-out) — 클리어할수록 선택지가
//     그대로 유지되거나 **넓어진다**(예: 비늘벽 4오픈→6→8, 확장트리 1→2→3).
//   · v1 부품의 주력이던 stripV 체인은 1→1→1 **단선** — 폭이 1로 고정돼 "하나 까고 뽑기 하나"의
//     지루한 플레이를 만든다(단선구조 지양 지시의 근원).
// v2 블록셀은 토폴로지를 먼저 정의한다: pile(병렬 리듬) · burst(1→N 동시 개방) · shingle(비늘 확장벽)
//   · tree6(1→2→3 확장트리) · invPyramid(기존, 1→2→…→N 델타) · openRow(기존, 전면 오픈).
// ════════════════════════════════════════════════════════════════════════════

/** **뭉치(pile)** — 거의 겹쳐 쌓인 n장(미세 오프셋+살짝 회전), 톱 1장만 오픈. 참조 #183037(8뭉치 들판).
 *   깊이 리듬 셀: 여러 뭉치를 병렬 배치하면 오픈 폭이 뭉치 수만큼 **일정하게 유지**된다. */
export function pile(n = 3, dx = 16, dy = 24, baseRot = 0) {
  // baseRot(±6 이내 권장): 뭉치 전체 기울기 — 바깥 뭉치를 바깥쪽으로 눕히면 참조작 클러스터의 방사형 룩.
  //   내부 지터 ±4와 합산 ≤10°(AABB 폭 ≈146px)로 유지해야 이웃 뭉치(최소 간격 ~156px)와 체인이 안 생긴다.
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: i * dx - ((n - 1) * dx) / 2, y: i * dy - ((n - 1) * dy) / 2, layer: i, rot: baseRot + (i % 2 ? -4 : 4) });
  }
  return out;
}

/** **버스트(burst)** — 앞 1장(오픈)이 뒤 2장을 동시에 덮는다 → 클리어 순간 2장 **동시 개방**(1→2).
 *   참조 #170502 로제트 클러스터의 최소 단위.
 *   ⚠️커버 규칙 실측(2026-07-19): 겹침 ≥1%면 **같은층이라도** 뒤 인덱스가 앞을 덮는다(15% 룰은 오기).
 *     → 같은층 이웃은 완전 무겹침(피치 ≥130, fitToBoard 압축 여유 포함)이어야 독립.
 *     → 1장이 뒤 3장을 덮는 구조는 AABB 규칙상 기하학적으로 불가능(측면 dx<120 필요 ↔ 뒷줄 무겹침 피치≥120
 *       동시 성립 불가) — **2장이 한계**. 1→3 확장은 tree6(1→2→3 두 단계)로 구현한다. rot 금지(AABB 확대). */
export function burst(nBack = 2, pitch = 130, drop = 62) {
  const out = [];
  const n = Math.min(2, nBack);
  for (let i = 0; i < n; i++) {
    const t = i - (n - 1) / 2;
    out.push({ x: t * pitch, y: 0, layer: 0, rot: 0 });
  }
  out.push({ x: 0, y: drop, layer: 1, rot: 0 });
  return out;
}

/** **비늘벽(shingle)** — 앞줄이 좁고 뒷줄이 넓은 기와 구조(줄마다 폭 +1, 전면 반피치 오프셋 → 앞 1장이
 *   뒤 2장을 덮음). 참조 #172142(4오픈→8→7 확장 벽). 진행할수록 오픈 폭이 **확장**되는 주력 셀. */
export function shingle(frontW = 3, rows = 3, pitchX = 124, pitchY = 86, bend = 0) {
  // bend: 스마일 곡률(px) — 줄 가장자리 카드가 살짝 내려앉는 완만한 호(참조 #172142). x 는 불변이라
  //   같은층 무겹침 안전성에 영향 없고, y 오프셋 ≤ ~20px 은 행간 커버(피치 86)도 그대로 유지된다.
  const out = [];
  for (let r = 0; r < rows; r++) {
    const w = frontW + (rows - 1 - r); // r=0 최후방(가장 넓음) → 마지막 r=전면(frontW, 오픈).
    for (let c = 0; c < w; c++) {
      const t = w === 1 ? 0 : (c - (w - 1) / 2) / ((w - 1) / 2);
      out.push({ x: (c - (w - 1) / 2) * pitchX, y: r * pitchY + bend * t * t, layer: r, rot: 0 });
    }
  }
  return out;
}

/** **확장트리(tree6)** — 6장 1→2→3 완전 이진 확장: 루트(오픈) 클리어→중단 2장→후방 3장 순으로 폭이 커진다.
 *   참조 로제트 클러스터의 커버 구조를 정면 트리로 정규화한 셀.
 *   ⚠️피치 124 필수(같은층 3형제 무겹침 120 + fit 여유) · rot 금지 — 110이면 뒷줄끼리 체인(실측). */
export function tree6(pitch = 124, stepY = 64) {
  return [
    { x: -pitch, y: 0, layer: 0, rot: 0 },
    { x: 0, y: 0, layer: 0, rot: 0 },
    { x: pitch, y: 0, layer: 0, rot: 0 },
    { x: -pitch / 2, y: stepY, layer: 1, rot: 0 },
    { x: pitch / 2, y: stepY, layer: 1, rot: 0 },
    { x: 0, y: stepY * 2, layer: 2, rot: 0 },
  ];
}

/** 남는 예산을 **뭉치들로 분배**(anchors 순서대로, 각 2~maxDepth장) — 병렬 리듬 유지하며 예산 흡수.
 *   ⚠️maxDepth = 메인 셀의 웨이브 수 이하로 줄 것 — 뭉치가 메인 셀보다 깊으면 종반에 뭉치 꼬리만 남아
 *   폭 1~2의 **단선 꼬리**가 생긴다(직접 관측된 함정). 1장이 남으면 마지막 뭉치를 1장 깊게. */
function distributePiles(count, anchors, maxDepth = 4) {
  let out = [];
  let left = count;
  for (let i = 0; i < anchors.length && left >= 2; i++) {
    const remainingAnchors = anchors.length - i;
    let n = Math.min(maxDepth, Math.max(2, Math.ceil(left / remainingAnchors)));
    if (left - n === 1) n = Math.min(maxDepth, n + 1); // 1장 잔여 방지(다음 뭉치 최소 2장 불가).
    n = Math.min(n, left);
    const a = anchors[i];
    const tilt = Math.max(-6, Math.min(6, ((a.x - 540) / 540) * 8)); // 방사형: 바깥 뭉치일수록 바깥으로 기움.
    out = out.concat(place(pile(n, 16, 24, tilt), a.x, a.y, a.layer ?? 0));
    left -= n;
  }
  return out;
}

/**
 * v2 스켈레톤 9종 — **설계 원칙 v5(오픈 확장)**:
 *   ① 초기 오픈 5~9 ② 진행 중 오픈 폭이 유지·확장(확장 셀 ≥1 필수: shingle/tree6/burst/invPyramid)
 *   ③ 예산 흡수는 단선 체인이 아니라 **병렬 뭉치**(distributePiles) ④ 전면 오픈줄(openRow)로 숨통
 *   ⑤ 좌우 대칭·밴드 밀착은 v1 관행 유지.
 */
// ⚠️구성 규칙(v5.2 — 드라이런 실측 2회 반영):
//   ① **파트마다 자기 y밴드**(세로 간격 ≥250) — compactBands 가 밴드 간 중심거리 172(>카드높이 164)를
//     보장하므로 밴드가 다르면 교차 커버가 **원천적으로 불가능**. 측면 나란히 배치(같은 밴드)는 파트 간
//     x 간격을 충분히(엣지 기준 ≥0px, 같은층 겹침 <15%) 확보할 때만.
//   ② openRow 는 초기 웨이브만 부풀려 상승 궤적을 망침 → v2 에선 사용하지 않음.
//   ③ 뭉치 maxDepth ≤ 메인 셀 웨이브 수 근처(초과 깊이는 종반 단선 꼬리) — 단 앵커 ≥3개면 distributePiles
//     가 깊이를 고르게 나눠 꼬리 폭 ≥3 유지.
//   ④ 초기 오픈 목표 5~9(셀 전면 + 뭉치 톱 합산으로 설계).
export const SKELETONS_V2 = [
  {
    id: 'cascadeWall', // 비늘 확장벽(중앙, 4→5→6 상승) + 하단 뭉치 밴드. 참조 #172142.
    build(budget) {
      const rows = budget >= 34 ? 4 : 3;
      const frontW = 4; // ⚠️고정 — fw5+rows4 는 행0 이 8장(988px)이 돼 fit 압축으로 피치가 붕괴(같은층 체인).
      let s = place(shingle(frontW, rows, 124, 86, 18), 540, 860, 0); // 스마일 곡률 18.
      const below = 860 + rows * 86 + 300;
      const rest = budget - s.length;
      s = s.concat(distributePiles(rest, [
        { x: 180, y: below }, { x: 540, y: below }, { x: 900, y: below },
        { x: 340, y: below + 250 }, { x: 740, y: below + 250 },
      ], rows));
      return s;
    },
  },
  {
    id: 'burstArc', // 버스트 아치(1→2 동시개방 ×5, 2단 아치) — 클리어 순간 보드가 활짝 열리는 체감.
    build(budget) {
      // 전면(front, layer1은 각 셀에서 고립)만 살짝 회전 — 아치의 방사감.
      let s = place(burst(2), 210, 900, 0).map((c) => (c.layer === 1 ? { ...c, rot: -8 } : c));
      s = s.concat(place(burst(2), 540, 860, 0));
      s = s.concat(place(burst(2), 870, 900, 0).map((c) => (c.layer === 1 ? { ...c, rot: 8 } : c)));
      s = s.concat(place(burst(2), 370, 1250, 0).map((c) => (c.layer === 1 ? { ...c, rot: -5 } : c)));
      s = s.concat(place(burst(2), 710, 1250, 0).map((c) => (c.layer === 1 ? { ...c, rot: 5 } : c)));
      const rest = budget - s.length;
      // 앵커 4·depth3 — 앵커 5+depth2 는 고예산에서 뭉치 톱이 5개가 돼 초기 오픈 10 초과(실측).
      s = s.concat(distributePiles(rest, [
        { x: 180, y: 1650 }, { x: 900, y: 1650 }, { x: 340, y: 1900 }, { x: 740, y: 1900 },
      ], 3));
      return s;
    },
  },
  {
    id: 'twinWings', // 쌍날개 부채(중앙 블레이드 오픈→양옆 방사 개방) + 중앙 비늘 밴드. 참조 #174229.
    build(budget) {
      const blades = budget >= 34 ? 7 : 5;
      const f = place(fan(blades, 58 + blades * 2, 205), 300, 900, 0);
      let s = f.concat(mirrorX(f));
      s = s.concat(place(shingle(3, 2, 124, 86, 12), 540, 1250, blades + 2));
      const rest = budget - s.length;
      s = s.concat(distributePiles(rest, [
        { x: 180, y: 1620 }, { x: 900, y: 1620 }, { x: 340, y: 1870 }, { x: 740, y: 1870 },
      ], 4));
      return s;
    },
  },
  {
    id: 'packetField', // 뭉치 들판(참조 #183037) — 이중 아치 7뭉치, 오픈 7 일정 유지(고선택지 리듬).
    build(budget) {
      const anchors = [
        { x: 210, y: 900 }, { x: 430, y: 850 }, { x: 650, y: 850 }, { x: 870, y: 900 },
        { x: 300, y: 1350 }, { x: 540, y: 1400 }, { x: 780, y: 1350 },
        { x: 420, y: 1850 }, { x: 660, y: 1850 }, // 대예산(40+)용 3단째 — 그 전엔 미사용.
      ];
      return distributePiles(budget, anchors, Math.min(5, Math.max(3, Math.ceil(budget / 7))));
    },
  },
  {
    id: 'treeGrove', // 확장트리 숲 — tree6 ×2(1→2→3 상승) + 뭉치 밴드. 참조 로제트 클러스터의 정규화.
    build(budget) {
      // 루트(layer2, 셀 내 고립)만 바깥쪽으로 살짝 회전 — 좌우 숲의 방사감.
      const t = place(tree6(), 280, 860, 0).map((c) => (c.layer === 2 ? { ...c, rot: -8 } : c));
      let s = t.concat(place(tree6(), 800, 860, 0).map((c) => (c.layer === 2 ? { ...c, rot: 8 } : c)));
      const rest = budget - s.length;
      s = s.concat(distributePiles(rest, [
        { x: 180, y: 1350 }, { x: 540, y: 1350 }, { x: 900, y: 1350 },
        { x: 340, y: 1600 }, { x: 740, y: 1600 },
      ], 3));
      return s;
    },
  },
  {
    id: 'deltaField', // 델타(역피라미드 1→2→3[→4] 상승) 쌍 — 날개 수렴 구도의 직교 정규화.
    build(budget) {
      const rows = 3; // ⚠️고정 — rows4 쌍은 총폭 1032px 로 fit 압축→피치 붕괴(같은층 체인, 실측 lv33·42).
      // 꼭짓점(전면 팁, layer rows-1 고립)만 바깥쪽 회전.
      const d = place(invPyramid(rows), 280, 860, 0).map((c) => (c.layer === rows - 1 ? { ...c, rot: -8 } : c));
      let s = d.concat(place(invPyramid(rows), 800, 860, 0).map((c) => (c.layer === rows - 1 ? { ...c, rot: 8 } : c)));
      const below = 860 + rows * 86 + 300;
      const rest = budget - s.length;
      s = s.concat(distributePiles(rest, [
        { x: 180, y: below }, { x: 540, y: below }, { x: 900, y: below },
        { x: 340, y: below + 250 }, { x: 740, y: below + 250 },
        { x: 420, y: below + 500 }, { x: 660, y: below + 500 },
      ], 3));
      return s;
    },
  },
  {
    id: 'laneWeave', // 직조 비늘(전면 2 → 후방 5, 깊은 상승) + 뭉치 밴드.
    build(budget) {
      let s = place(shingle(2, 4, 124, 86, 10), 540, 860, 0);
      const rest = budget - s.length;
      s = s.concat(distributePiles(rest, [
        { x: 180, y: 1550 }, { x: 540, y: 1550 }, { x: 900, y: 1550 },
        { x: 340, y: 1800 }, { x: 740, y: 1800 },
      ], 4));
      return s;
    },
  },
  {
    id: 'crownField', // 크라운 버스트(1→2 ×3) + 넓은 뭉치 들판 — 릴리프(선택지 넉넉·얕음).
    build(budget) {
      let s = place(burst(2), 200, 880, 0).map((c) => (c.layer === 1 ? { ...c, rot: -8 } : c));
      s = s.concat(place(burst(2), 540, 850, 0));
      s = s.concat(place(burst(2), 880, 880, 0).map((c) => (c.layer === 1 ? { ...c, rot: 8 } : c)));
      const rest = budget - s.length;
      s = s.concat(distributePiles(rest, [
        { x: 180, y: 1350 }, { x: 540, y: 1350 }, { x: 900, y: 1350 },
        { x: 340, y: 1600 }, { x: 740, y: 1600 },
      ], 3));
      return s;
    },
  },
  {
    id: 'stadium', // 종합 구도 — 상단 확장트리 + 중앙 비늘 + 하단 쌍날개(모든 확장 셀 혼합, 밴드 3단).
    build(budget) {
      let s = place(tree6(), 540, 780, 0);
      s = s.concat(place(shingle(3, 3, 124, 86, 16), 540, 1120, 2));
      const f = place(fan(4, 50, 185), 250, 1560, 0);
      s = s.concat(f, mirrorX(f));
      const rest = budget - s.length;
      s = s.concat(distributePiles(rest, [{ x: 540, y: 1560 }, { x: 340, y: 1870 }, { x: 740, y: 1870 }], 3));
      return s;
    },
  },
];

/** v2 부품 카탈로그(에디터 부품 스탬프탭용) — 확장 토폴로지 셀 4종. */
export const PARTS_V2 = { pile, burst, shingle, tree6 };

/** v2 자동 설계 — 확장 원리 스켈레톤 로테이션(9종). composeLevel 과 동일 후처리(대칭 변주·밴드 밀착·fit). */
export function composeLevelV2(level, budget, rngSeedFn) {
  const rnd = rngSeedFn ?? mulberry32(level * 2654435761 + 7);
  const sk = SKELETONS_V2[(level - 1) % SKELETONS_V2.length];
  let s = sk.build(budget, rnd);
  if (Math.floor((level - 1) / SKELETONS_V2.length) % 2 === 1) s = mirrorX(s);
  const slots = fitToBoard(compactBands(s));
  return slots.map((q, i) => ({ id: `c${i}`, x: q.x, y: q.y, layer: q.layer, face: 'fold', rot: Math.round(q.rot ?? 0) }));
}

// ════════════════════════════════════════════════════════════════════════════
// ── v3 문법(2026-07-19) — **유기적 곡선 + 부채 묶음(참조 44장 재학습)** ────────
//
// 참조작 재분석의 결론(v2 실패 반성): 좋은 판의 미감은 격자·역삼각형 블록이 아니라
//   ① **부채 묶음(packetFan)** — 앞면 1장 뒤에 2~4장이 부채처럼 펼쳐진 "손패" 룩(회전 표현).
//   ② **유기적 경로 배치** — 화환(wreath)·리본(S커브)·호(garland)·십자 클러스터·가로 스크롤.
//   재미(오픈 확장)는 "얕은 묶음 여럿을 넓게" 에서 나오고, 미감은 "그 묶음을 곡선에 회전 배치" 에서 나온다.
//   ⚠️엔진(editorLevels.ts)은 이미 **회전 사각형(OBB) 커버 판정**을 지원한다 — v2 처럼 회전을 겁낼 필요 없음.
// ════════════════════════════════════════════════════════════════════════════

/** **부채 묶음(packetFan)** — depth 장의 깊이 파일을 부채로 렌더(앞면 1장 + 뒤 부채). 커버=순수 깊이(앞이
 *   뒤 전부를 덮어 한 번에 1장씩 열림). 참조 #180002·#184328 손패 묶음. depth 2~5. */
export function packetFan(depth = 3, spread = 20, spreadR = 34) {
  const out = [];
  const backN = Math.max(1, depth - 1);
  const mid = (backN - 1) / 2;
  for (let i = 0; i < backN; i++) {
    const t = backN === 1 ? 0 : (i - mid) / mid; // -1..1
    out.push({ x: t * spreadR, y: -Math.abs(t) * 6, layer: i, rot: t * spread });
  }
  out.push({ x: 0, y: 6, layer: depth - 1, rot: 0 }); // 앞면(최상층)·중앙·거의 수직.
  return out;
}

/** **십자 클러스터(crossCluster)** — + 모양 5장, 중앙 앞면. 참조 #175053 로제트 꽃. 커버=중앙이 4팔을 덮는 깊이 파일. */
export function crossCluster() {
  return [
    { x: 0, y: -84, layer: 0, rot: 0 },
    { x: -96, y: 0, layer: 1, rot: 0 },
    { x: 96, y: 0, layer: 2, rot: 0 },
    { x: 0, y: 84, layer: 3, rot: 0 },
    { x: 0, y: 0, layer: 4, rot: 0 },
  ];
}

/** 예산을 노드 수로 분배(각 depth ≥ minD) — 남는 건 앞쪽 노드에 +1. */
function splitDepth(budget, n, minD = 2) {
  const base = Math.floor(budget / n);
  const extra = budget - base * n;
  return Array.from({ length: n }, (_, i) => Math.max(minD, base + (i < extra ? 1 : 0)));
}

/** 호(arc) 위 n개 노드 좌표+접선 기울기 — a0~a1(deg, 화면좌표: 아래로 +y). 카드가 바깥으로 기울게 tilt. */
function arcNodes(n, cx, cy, radius, a0, a1, tilt = 0.06) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const a = ((a0 + (a1 - a0) * t) * Math.PI) / 180;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    out.push({ x, y, rot: Math.max(-18, Math.min(18, (x - cx) * tilt)) });
  }
  return out;
}

/** 가로 줄 n개 노드(스크롤형·부채묶음 배치용). */
function rowNodes(n, cx, cy, pitch, tilt = 0) {
  const out = [];
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) out.push({ x: cx + (i - mid) * pitch, y: cy, rot: (i - mid) * tilt });
  return out;
}

/** 노드 목록에 부채묶음(또는 depth1=단일 카드)을 배치. 노드 rot 는 묶음 전체 기울기로 합산. */
function packetsOnNodes(nodes, depths) {
  let out = [];
  nodes.forEach((nd, i) => {
    const d = depths[i] ?? 2;
    if (d <= 1) {
      out.push({ x: nd.x, y: nd.y, layer: 0, rot: nd.rot ?? 0 });
    } else {
      const pk = packetFan(d).map((c) => ({ ...c, rot: c.rot + (nd.rot ?? 0) }));
      out = out.concat(place(pk, nd.x, nd.y, 0));
    }
  });
  return out;
}

/**
 * v3 스켈레톤 — **유기적 곡선 구도**(부채 묶음을 화환·호·리본·십자·스크롤 경로에 회전 배치).
 *   각 묶음은 얕은 깊이 파일(1오픈)이고, 여러 묶음이 넓은 프론티어를 만든다(오픈 확장).
 *   좌우 대칭/회전 표현 자유(엔진 OBB 지원). budget 흡수는 묶음 depth 로.
 */
export const SKELETONS_V3 = [
  {
    id: 'wreath', // 화환 — 큰 타원 둘레에 부채묶음(참조 #181032·#182342). 넓은 원형 프론티어.
    build(budget) {
      const n = budget >= 34 ? 9 : 7;
      const nodes = arcNodes(n, 540, 1330, 470, 200, 340, 0.05).map((nd) => ({ ...nd, y: nd.y - 90 }));
      // 위쪽으로 열린 화환(끝을 살짝 안으로) — 아래는 스톡 자리 비움.
      return packetsOnNodes(nodes, splitDepth(budget, n));
    },
  },
  {
    id: 'twinFans', // 쌍부채 — 좌우로 뿜어나가는 부채(참조 #172142). 반경 크게(블레이드 무겹침→오픈↑) + 하단 3묶음.
    build(budget) {
      const per = Math.max(4, Math.round((budget - 6) / 4));
      const f = place(fan(Math.min(6, per), 96, 300), 300, 1150, 0);
      let s = f.concat(mirrorX(f));
      const rest = Math.max(3, budget - s.length);
      s = s.concat(packetsOnNodes(rowNodes(3, 540, 1580, 240), splitDepth(rest, 3)));
      return s;
    },
  },
  {
    id: 'garlandDouble', // 이중 화환 — 위·아래 두 호(참조 #182342). 위 호는 큰 곡률, 아래는 완만.
    build(budget) {
      const top = Math.ceil(budget * 0.55);
      const bot = budget - top;
      const nT = budget >= 34 ? 5 : 4;
      const nB = budget >= 34 ? 4 : 3;
      const up = packetsOnNodes(arcNodes(nT, 540, 1080, 360, 205, 335, 0.07), splitDepth(top, nT));
      const dn = packetsOnNodes(arcNodes(nB, 540, 1560, 420, 210, 330, 0.05), splitDepth(bot, nB));
      return up.concat(dn);
    },
  },
  {
    id: 'rosetteRow', // 로제트 3송이 — 십자 클러스터 ×3(참조 #175053). 꽃 배열.
    build(budget) {
      let s = place(crossCluster(), 260, 1200, 0).concat(place(crossCluster(), 540, 1150, 0), place(crossCluster(), 820, 1200, 0));
      const rest = budget - s.length;
      if (rest >= 2) s = s.concat(packetsOnNodes(rowNodes(Math.min(3, Math.max(2, Math.round(rest / 3))), 540, 1620, 260), splitDepth(rest, Math.min(3, Math.max(2, Math.round(rest / 3))))));
      return s;
    },
  },
  {
    id: 'ribbonS', // 리본 S커브 — 부채묶음이 S자로 흐름(참조 #134632). 좌상→우하 물결.
    build(budget) {
      const n = budget >= 34 ? 8 : 6;
      const nodes = [];
      const mid = (n - 1) / 2;
      for (let i = 0; i < n; i++) {
        const t = (i - mid) / mid; // -1..1
        nodes.push({ x: 540 + t * 360, y: 1330 + Math.sin(t * Math.PI) * 240, rot: -t * 14 });
      }
      return packetsOnNodes(nodes, splitDepth(budget, n));
    },
  },
  {
    id: 'scrollRow', // 가로 스크롤 — 한 줄 부채묶음(참조 #174758·#182635). 좌→우 진행.
    build(budget) {
      const n = budget >= 34 ? 7 : 6;
      return packetsOnNodes(rowNodes(n, 540, 1330, Math.min(150, 840 / (n - 1)), 3), splitDepth(budget, n));
    },
  },
  {
    id: 'bunchWings', // 날개 묶음 — 위 3송이 + 아래 3송이 대칭(참조 #180818·#180002). 부채묶음 육각 배열.
    build(budget) {
      const nodesTop = [{ x: 300, y: 1080, rot: -8 }, { x: 540, y: 1030, rot: 0 }, { x: 780, y: 1080, rot: 8 }];
      const nodesBot = [{ x: 300, y: 1520, rot: 8 }, { x: 540, y: 1570, rot: 0 }, { x: 780, y: 1520, rot: -8 }];
      const nodes = nodesTop.concat(nodesBot);
      return packetsOnNodes(nodes, splitDepth(budget, 6));
    },
  },
  {
    id: 'crownArc', // 크라운 호 — 위로 솟은 부채묶음 호(참조 #170502·#014138). 왕관형 상단 곡선.
    build(budget) {
      const n = budget >= 34 ? 7 : 5;
      const nodes = arcNodes(n, 540, 1720, 640, 235, 305, 0.06);
      return packetsOnNodes(nodes, splitDepth(budget, n));
    },
  },
];

/** v3 자동 설계 — 유기적 곡선 스켈레톤 로테이션(8종). 회전 보존 위해 compactBands 생략(곡선은 이미 밀집). */
export function composeLevelV3(level, budget, rngSeedFn) {
  const sk = SKELETONS_V3[(level - 1) % SKELETONS_V3.length];
  let s = sk.build(budget, rngSeedFn ?? mulberry32(level * 2654435761 + 7));
  if (Math.floor((level - 1) / SKELETONS_V3.length) % 2 === 1) s = mirrorX(s);
  const slots = fitToBoard(s);
  return slots.map((q, i) => ({ id: `c${i}`, x: q.x, y: q.y, layer: q.layer, face: 'fold', rot: Math.round(q.rot ?? 0) }));
}

// ════════════════════════════════════════════════════════════════════════════
// ── v4 문법(2026-07-19) — **연결된 하나의 유기적 그림**(참조작 재재학습) ────────
//
// PO 재지적: "너무 작은 단위가 파편화돼 흩어져 있다. 각 블록이 독립적이되 유기적으로 연결되어 전체가
//   하나의 연결된 그림으로 디자인돼야 한다." — v3(작은 부채묶음이 틈새 두고 산개)의 반성.
//
// 참조작(#133504·#015157·#182125·#175053)의 진짜 원리: 카드들이 **벽돌처럼 맞물려 틈 없이 하나의 형상**
//   (돔·아치·다이아·왕관·꽃)을 이룬다. 연결의 비밀 = **브릭 타일링**: 앞줄 카드는 서로 안 겹쳐(전부 오픈)
//   가로로 늘어서고, 뒷줄 카드가 **앞줄 틈(밸리)에 반칸 어긋나 끼어** 양옆 앞카드에 덮이며 틈을 메운다 →
//   전체가 연결된 하나의 그림 + 앞줄 넓은 오픈 프론티어(피면서 위로 파동). v1(연결이나 뻣뻣)·v3(예쁘나
//   파편) 사이의 정답. 유기성 = 줄 곡률(스마일)·전체 아치·가장자리 회전.
// ════════════════════════════════════════════════════════════════════════════

/**
 * **브릭 타일 형상(tiledShape)** — rowWidths(앞줄=r0=가장 넓고 아래·오픈 → 뒤로 갈수록 위) 를 벽돌 타일로
 *   깔아 **틈 없이 연결된 하나의 형상**을 만든다. 뒷줄은 반칸(pitchX/2) 어긋나 앞줄 밸리에 끼어 연결.
 *   커버는 좌표+레이어에서 자동 파생(뒷 카드는 양옆 앞카드가 덮음 → 파동 피핑). 유기성: smile(줄 곡률)·
 *   tilt(가장자리 회전)·arcBow(전체 아치). pitchX 122(앞줄 동일줄 무겹침=오픈) · pitchY 76(줄 간 큰 겹침).
 */
export function tiledShape(rowWidths, opts = {}) {
  // ⚠️핵심 제약(실측): ① 같은 줄 카드가 서로 덮이면 그 줄이 체인이 돼 오픈이 1로 붕괴 → **동일 줄 무겹침**
  //   필수(pitchX ≥124 + 회전 최소). ② 회전은 OBB 를 넓혀 같은 줄 이웃을 덮으므로 tilt ≤3°, **앞줄(오픈)은
  //   회전 0**. ③ 폭×pitch 가 보드(888px)를 넘으면 fitToBoard 가 압축해 pitch 가 카드폭 밑으로 떨어져 겹침 →
  //   한 줄 최대 7장(6*124+120=864<888). 유기성은 회전이 아니라 **형상 외곽선·줄 곡률(smile/arcBow)** 로.
  const { cx = 540, frontY = 1760, pitchX = 124, pitchY = 76, smile = 24, tilt = 3, arcBow = 0 } = opts;
  const rows = rowWidths.length;
  const out = [];
  for (let r = 0; r < rows; r++) {
    const w = rowWidths[r];
    if (w <= 0) continue;
    const layer = rows - 1 - r; // 앞줄(r0)=최상층(오픈), 뒤로 갈수록 낮은 층.
    const brick = (r % 2) * (pitchX / 2); // 홀수줄 반칸 어긋남 → 밸리에 끼어 연결.
    const baseY = frontY - r * pitchY;
    const half = (w - 1) / 2;
    for (let c = 0; c < w; c++) {
      const t = half === 0 ? 0 : (c - half) / half; // -1..1
      const dx = (c - half) * pitchX + brick;
      const y = baseY + smile * t * t - arcBow * (1 - t * t); // 스마일(가장자리↓) + 전체 아치(중앙↑)
      const rot = r === 0 ? 0 : Math.max(-3, Math.min(3, tilt * t)); // 앞줄 회전0·뒤줄 ≤3°(무겹침 보존).
      out.push({ x: cx + dx, y, layer, rot });
    }
  }
  return out;
}

/** 목표 예산에 맞춰 rowWidths 생성 — 앞줄 폭 frontW(최대 7)에서 뒤로 profile 만큼 줄이며 합≈budget. 폭 상한 7. */
function rowsForBudget(budget, frontW, profile) {
  const fw = Math.min(7, frontW);
  const widths = [];
  let sum = 0;
  let prev = 99;
  for (let r = 0; r < profile.length && sum < budget; r++) {
    let w = Math.max(2, Math.min(7, fw + profile[r]));
    w = Math.min(w, prev); // **단조 비증가 강제** — 뒷줄이 앞줄보다 넓으면 가장자리가 안 덮여 오픈 폭발.
    if (sum + w > budget && r > 0) w = Math.max(2, Math.min(prev, budget - sum));
    if (w < 2) break;
    widths.push(w);
    sum += w;
    prev = w;
  }
  // 예산이 남으면 뒤에 좁은 줄을 더 쌓아 채운다 — **직전 줄 이하 폭 유지**(단조 비증가).
  while (sum < budget && prev >= 3) {
    const w = Math.max(2, Math.min(prev, budget - sum));
    if (w < 2) break;
    widths.push(w);
    sum += w;
    prev = w;
  }
  return widths;
}

/**
 * **곡선 밴드(curvedBand)** — 기준선 곡선 baseFn(t)→{x,y} 위에 thickness 겹을 쌓아 **틈 없이 연결된 밴드**를
 *   만든다(아치·링·하트·물결 등 산봉우리가 아닌 형상의 핵심). 앞줄(d=0)=바깥 곡선·오픈, 뒷줄은 안쪽(perp
 *   방향으로 rowGap 씩)·반칸 어긋나 밸리에 껴 연결·커버. 회전은 곡선 접선 기울기(tangent)로 유기적.
 *   ⚠️같은 겹 이웃 무겹침 위해 nFront 카드가 곡선 길이에 pitch≥128 로 분포해야(호출부 책임).
 */
export function curvedBand(baseFn, nFront, thickness, opts = {}) {
  const { rowGap = 62, shrink = 1, tiltScale = 16 } = opts;
  const out = [];
  for (let d = 0; d < thickness; d++) {
    const n = Math.max(2, nFront - d * shrink);
    const layer = d; // d=0 바깥=오픈, 안쪽으로 갈수록 높은 층? → 아니. 바깥이 앞(오픈)이려면 바깥=최상층.
    for (let i = 0; i < n; i++) {
      const off = (d % 2) * (0.5 / (n - 1 || 1)); // 반칸 어긋남.
      const t = n === 1 ? 0 : ((i / (n - 1)) * 2 - 1) + off * 2;
      const tc = Math.max(-1, Math.min(1, t));
      const p = baseFn(tc); // 바깥 곡선 위 점.
      const pn = baseFn(tc + 0.001);
      const pp = baseFn(tc - 0.001);
      // 접선 방향 → 안쪽 법선(perp)으로 d*rowGap 이동(밴드 두께).
      let nx = -(pn.y - pp.y), ny = pn.x - pp.x;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      // 법선이 밴드 안쪽(중심 방향)을 향하도록 부호 맞춤(중심 cx,cy 기준).
      const cx = opts.cx ?? 540, cy = opts.cy ?? 1300;
      if ((p.x - cx) * nx + (p.y - cy) * ny > 0) { nx = -nx; ny = -ny; }
      const tang = Math.atan2(pn.y - pp.y, pn.x - pp.x) * 180 / Math.PI;
      out.push({ x: p.x + nx * d * rowGap, y: p.y + ny * d * rowGap, layer: thickness - 1 - d, rot: Math.round(Math.max(-tiltScale, Math.min(tiltScale, tang))) });
    }
  }
  return out;
}

/**
 * v4 스켈레톤 — **연결된 유기적 형상**(브릭 타일 + 곡선 밴드). 산봉우리(dome/mesa/spire)뿐 아니라
 *   무지개 아치·링·하트·물결 등 곡선 형상 포함. 전부 틈 없이 하나의 그림 + 앞줄 넓은 프론티어.
 */
export const SKELETONS_V4 = [
  {
    id: 'rainbowArch', // 무지개 아치(∩) — 참조 이미지 모작(2026-07-19 v2). **똑바로 선 카드**(회전0)를 얕고
    //   넓은 아치 위치에 계단 배치 + 뒷줄 브릭 밴드 + 중앙 매달림. ⚠️회전 금지(회전=부채룩=참조와 다름).
    build(budget) {
      const cx = 540, pitchX = 128, peakY = 1120, drop = 250; // 넓게·얕게(참조 정합).
      const yAt = (t) => peakY + drop * t * t;
      const thick = budget >= 22 ? 3 : 2; // ⚠️겹 상한 3 — 더 두꺼우면 중앙이 채워져 산이 됨(속 빈 아치 유지).
      const s = [];
      for (let d = 0; d < thick; d++) {
        const n = 7 - d; // 뒤로 갈수록 1장 적게(정상부 채움).
        const half = (n - 1) / 2;
        for (let i = 0; i < n; i++) {
          const c = i - half; // 반칸 어긋남은 half 가 .5 단위라 자동.
          const t = c / 3;
          s.push({ x: cx + c * pitchX, y: yAt(t) - d * 72, layer: thick - 1 - d, rot: 0 });
        }
      }
      s.push({ x: cx, y: peakY + 210, layer: thick + 1, rot: 0 }); // 중앙 매달림(오픈).
      return s;
    },
  },
  {
    id: 'ring', // 링/화환(○) — 속 빈 타원 밴드(참조 #181032). 바깥 원=오픈, 안쪽=커버.
    build(budget) {
      const cx = 540, cy = 1320, rx = 400, ry = 470;
      const n = budget >= 30 ? 9 : 8; // 오픈 둘레 카드 수(게이트 ≤9 준수).
      const ellipse = (t) => { const a = t * Math.PI; return { x: cx + Math.sin(a) * rx, y: cy - Math.cos(a) * ry }; }; // t=-1..1 전체 둘레.
      const thick = budget >= 26 ? 3 : 2;
      return curvedBand(ellipse, n, thick, { rowGap: 60, shrink: 1, tiltScale: 18, cx, cy });
    },
  },
  {
    id: 'dome', // 돔/언덕 — 앞줄 넓고 위로 좁아지는 둥근 봉우리(참조 #133504·#015157). smile 큰 곡률.
    build(budget) {
      const fw = budget >= 28 ? 8 : 7;
      return tiledShape(rowsForBudget(budget, fw, [0, -1, -2, -3, -4]), { smile: 30, tilt: 11, frontY: 1780 });
    },
  },
  {
    id: 'banner', // 배너/현수막 — 앞줄 넓은 띠가 완만히 아치(참조 #182125). 3줄·큰 arcBow.
    build(budget) {
      return tiledShape(rowsForBudget(budget, 7, [0, 0, -1]), { smile: 8, arcBow: 55, frontY: 1560 });
    },
  },
  {
    id: 'mesa', // 메사/고원 — 넓은 평평한 사다리꼴(앞 7 → 위로 완만히 좁힘, 낮은 곡률). 안정적 대형.
    build(budget) {
      return tiledShape(rowsForBudget(budget, 7, [0, -1, -2, -3]), { smile: 6, frontY: 1620 });
    },
  },
  {
    id: 'hill', // 언덕 — 중간 높이 봉우리(앞 7 → 5 → 3). 자연스러운 산.
    build(budget) {
      return tiledShape(rowsForBudget(budget, 7, [0, -2, -4, -5]), { smile: 20, tilt: 3, frontY: 1600 });
    },
  },
  {
    id: 'fanCrown', // 부채 왕관 — 앞줄 넓고 뒷줄이 부채처럼 벌어짐(뒷줄 회전·넓은 pitch). 왕관 실루엣.
    build(budget) {
      return tiledShape(rowsForBudget(budget, 7, [0, -1, -2, -3]), { smile: 4, tilt: 3, pitchX: 128, frontY: 1600 });
    },
  },
  {
    id: 'spire', // 첨탑 — 앞 7에서 중앙 첨탑으로 뾰족하게(참조 #015157 중앙 스파이어). 삼각 봉우리.
    build(budget) {
      return tiledShape(rowsForBudget(budget, 7, [0, -2, -4, -6]), { smile: 12, tilt: 3, frontY: 1580 });
    },
  },
  {
    id: 'pagoda', // 탑/계단 — 층이 뚜렷한 계단형(큰 줄 간격·좁은 곡률). 층층 실루엣.
    build(budget) {
      return tiledShape(rowsForBudget(budget, 7, [0, -2, -4]), { smile: 4, pitchY: 92, frontY: 1560 });
    },
  },
  {
    id: 'arch', // 아치/무지개 — 앞줄이 크게 휜 아치(참조 #133504 아치 봉우리). 강한 arcBow + 곡률.
    build(budget) {
      return tiledShape(rowsForBudget(budget, 7, [0, -1, -3]), { smile: 30, arcBow: 60, frontY: 1560 });
    },
  },
  {
    id: 'blossom', // 꽃송이 — 둥근 봉우리(높은 곡률로 부드러운 원형). 앞 7 → 6 → 4.
    build(budget) {
      return tiledShape(rowsForBudget(budget, 7, [0, -1, -3, -4]), { smile: 26, tilt: 3, frontY: 1600 });
    },
  },
];

/** v4 자동 설계 — 연결된 유기적 형상 로테이션(8종). 브릭 타일이라 하나의 그림 + 넓은 프론티어. */
export function composeLevelV4(level, budget, rngSeedFn) {
  const sk = SKELETONS_V4[(level - 1) % SKELETONS_V4.length];
  let s = sk.build(budget, rngSeedFn ?? mulberry32(level * 2654435761 + 7));
  if (Math.floor((level - 1) / SKELETONS_V4.length) % 2 === 1) s = mirrorX(s);
  const slots = fitToBoard(s);
  return slots.map((q, i) => ({ id: `c${i}`, x: q.x, y: q.y, layer: q.layer, face: 'fold', rot: Math.round(q.rot ?? 0) }));
}

/** 간단 결정적 rng (에디터 겸용). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 에디터(classic script) 겸용 전역 — v2 셀·스켈레톤 포함(에디터 부품탭·자동설계에서 사용 가능).
if (typeof window !== 'undefined') {
  window.ShapeGrammar = { PARTS, PARTS_V2, PARTS_V3: { packetFan, crossCluster, fan }, PARTS_V4: { tiledShape }, SKELETONS, SKELETONS_V2, SKELETONS_V3, SKELETONS_V4, place, mirrorX, fitToBoard, composeLevel, composeLevelV2, composeLevelV3, composeLevelV4, mulberry32 };
}
