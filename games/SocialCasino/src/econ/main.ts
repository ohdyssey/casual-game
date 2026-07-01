/**
 * econ/main.ts — **경제 콘솔 대시보드**(현대형). econ.html 진입. 게임 SSOT(progression·economy·playParams)를 직접 import → 실값 추적.
 *
 *   상단 KPI 카드 + 헬스체크 배지(점검/판단) + 차트(톱니·비용곡선·T(n)·유입구성·리그밴드) + 레버 슬라이더 + 미션/리그 표 + 변경기록/익스포트.
 *   값 변경 → 즉시(닫힌형 차트·배지) + 디바운스(시뮬 KPI/체크/톱니). 작업셋·기록은 localStorage 영속.
 */
import { LEVERS, GROUP_LABELS, type WorkingState, type LeverGroup } from './levers.js';
import { simulate, cityCostP, incomeMultP, missionTargetP, type SimOptions } from './sim.js';
import { bandContributions, expectedSpinPerPeriod, expectedCoinPerPeriod } from './league.js';
import {
  HOTELS_TOTAL, FACILITIES_PER_HOTEL, STAGES_PER_FACILITY, UPGRADES_PER_HOTEL,
  HOTEL_UPGRADES_TOTAL, HOTEL_LEVELS_TOTAL, HOTEL_COST_BASE, HOTEL_COST_GROWTH, FOCUSED_DAY_INCOME,
} from '../logic/progression.js';
import { runBundle, kpisFromBundle, formulaChecks, simChecksFromBundle, PLAIN_HELP, type CheckResult } from './checks.js';
import { loadWorking, saveWorking, resetWorking, ssotWorking, diffFromSsot, exportJSON, exportSourceDiff, loadChangelog, appendChangelog, clearChangelog, type ChangeEntry } from './store.js';
import { drawLines, drawBars, fmtNum } from './charts.js';
import { observedSummary, clearTelemetry } from './telemetry.js';

// ── DOM 헬퍼 ──
type Attrs = Record<string, string | number | boolean | ((e: Event) => void)>;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = String(v);
    else if (k === 'html') e.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v as EventListener);
    else if (typeof v === 'boolean') { if (v) e.setAttribute(k, ''); }
    else e.setAttribute(k, String(v));
  }
  for (const c of children) e.append(c);
  return e;
}
const $ = (id: string) => document.getElementById(id)!;
const fmtSigned = (v: number): string => (v >= 0 ? '+' : '') + Math.round(v).toLocaleString('en-US');

let ws: WorkingState = loadWorking();
let simTimer: number | undefined;

// ── 빌드(정적 구조 1회) ──
function build(): void {
  const app = $('app');
  app.innerHTML = '';
  app.append(
    h('div', { class: 'topbar' }, [
      h('div', { class: 'brand' }, [
        h('h1', {}, ['MATCHSLOT CITY · 경제 콘솔']),
        h('p', {}, ['확률·데이터 로직 추적/조정/점검/기록 — 게임 SSOT 직접 연동(progression·economy·playParams)']),
      ]),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => recomputeSim(true) }, ['▶ 다시 계산']),
      h('button', { class: 'btn', onclick: showJSON }, ['💾 JSON']),
      h('button', { class: 'btn', onclick: showDiff }, ['⧉ 소스 diff']),
      h('button', { class: 'btn danger', onclick: doReset }, ['↺ SSOT 리셋']),
    ]),
    introCard(),
    h('div', { class: 'kpis', id: 'kpis' }),
    sectionTitle('건강 점검 (판단)', '핵심 불변식 + 시뮬 밴드. 빨강 = 설계 위험'),
    h('div', { class: 'pills', id: 'pills' }),
    sectionTitle('시뮬레이션', '풀루프 오토플레이 — 스핀 톱니·코인 엔진'),
    h('div', { class: 'grid cols2' }, [
      chartCard('스핀 잔고 톱니 (30일, 리그 OFF/ON)', 'cv_saw', '잔고가 초중반 상승(쌓이는 느낌) 후 소진(드레인)이면 정상. 2선=리그 효과.'),
      chartCard('스핀 유입 구성', 'cv_src', '젬환급·대박·미션·호텔·데일리·리그. 호텔·미션 마일스톤이 큰 상승니.'),
    ]),
    sectionTitle('진행 곡선', '닫힌형 — 즉시 갱신'),
    h('div', { class: 'grid cols3' }, [
      chartCard('시티 비용 Cost(L) vs 획득배수 M(L)', 'cv_cost', 'γ^L 비용이 M(L) 획득을 추월해야 목표 영속(α<γ).'),
      chartCard('업그레이드 상대 소요 T(n)=비용/배수', 'cv_tn', '단조 증가 = 후반 페이싱(리텐션).'),
      chartCard('리그 밴드 기여 (스핀/주)', 'cv_league', '참여·등급가중 반영. 합=기대 주입/주.'),
    ]),
    sectionTitle('🏨 호텔 업그레이드 비용 (500단계)', '10도시 × 10시설 × 5단계 = 500업그레이드 = 100레벨 · 단계마다 연속 상승(도시별 리셋 없음)'),
    h('div', { class: 'card', id: 'hotelcost' }),
    sectionTitle('레버 (핵심 줄기 조정)', '슬라이더로 트리거 조정 → 즉시 재계산. SSOT 대비 변경분은 금색 표시'),
    h('div', { class: 'grid cols3', id: 'levers' }),
    sectionTitle('미션 플랜', '젬×베팅 목표 + 보상(스핀↔코인 교대). 시티레벨로 목표 스케일'),
    h('div', { class: 'card', id: 'missions' }),
    sectionTitle('리그 (추후 도입 — 경제 영향 모델링)', '켜고 파라미터를 바꿔 순스핀/일에 미치는 영향을 점검'),
    h('div', { class: 'card', id: 'league' }),
    sectionTitle('실측 플레이어 데이터', '게임 플레이 시 자동 누적 — 모델(시뮬) 대비 실제값 비교'),
    h('div', { class: 'card', id: 'observed' }),
    sectionTitle('용어 정의', '전문 용어 설명'),
    glossaryCard(),
    sectionTitle('변경 기록 (추적)', '설계 결정을 사유와 함께 기록 — 무엇을 왜 바꿨는지'),
    h('div', { class: 'card', id: 'changelog' }),
    sectionTitle('익스포트', '튜닝값을 소스에 반영(커밋)하거나 JSON 백업'),
    h('div', { class: 'card' }, [h('pre', { id: 'exportpre' }, ['JSON / 소스 diff 버튼을 누르면 여기에 표시됩니다.'])]),
  );
  renderLevers();
  renderMissions();
  renderLeague();
  renderHotelCost();
  renderObserved();
  renderChangelog();
  updateCheap();
  recomputeSim(true);
}

// ── 🏨 호텔 업그레이드 비용 (500단계) ──
let hotelBase = HOTEL_COST_BASE; // 첫 단계 비용(튜닝)
let hotelGrowth = HOTEL_COST_GROWTH; // 단계당 상승률(튜닝)
const hcost = (k: number): number => Math.round(hotelBase * Math.pow(hotelGrowth, Math.max(1, k) - 1));
function renderHotelCost(): void {
  const root = $('hotelcost');
  root.innerHTML = '';
  const N = HOTEL_UPGRADES_TOTAL; // 500
  const unit: number[] = [];
  const cum: number[] = [];
  let run = 0;
  for (let k = 1; k <= N; k++) { const c = hcost(k); unit.push(c); run += c; cum.push(run); }
  const total = run;

  // 조정 입력(첫단계 비용 C0 · 단계당 상승률 γ) — 변경 시 차트·표 즉시 갱신.
  const baseIn = h('input', { type: 'number', value: hotelBase, min: 1000, step: 1000 }) as HTMLInputElement;
  const growthIn = h('input', { type: 'number', value: hotelGrowth, min: 1.0, max: 1.1, step: 0.001 }) as HTMLInputElement;
  baseIn.addEventListener('change', () => { hotelBase = Math.max(1000, Number(baseIn.value) || HOTEL_COST_BASE); renderHotelCost(); });
  growthIn.addEventListener('change', () => { hotelGrowth = Math.min(1.1, Math.max(1.0, Number(growthIn.value) || HOTEL_COST_GROWTH)); renderHotelCost(); });

  root.append(
    h('div', { class: 'cap', html:
      `구조: <b>${HOTELS_TOTAL}도시 × ${FACILITIES_PER_HOTEL}시설 × ${STAGES_PER_FACILITY}단계 = ${N} 업그레이드 = ${HOTEL_LEVELS_TOTAL} 레벨</b> · 호텔당 ${UPGRADES_PER_HOTEL}단계(완성 시 다음 도시). ` +
      `cost(k) = C0 × γ<sup>k-1</sup> (단계마다 연속 상승).` }),
    h('div', { class: 'l-ctrl', style: 'margin:8px 0' }, [
      h('span', { class: 'l-name' }, ['첫 단계 비용 C0']), baseIn,
      h('span', { class: 'l-name', style: 'margin-left:16px' }, ['단계당 상승률 γ']), growthIn,
    ]),
    h('div', { class: 'kpis', style: 'margin:6px 0' }, [
      kpiMini('하루 집중수입 (앵커)', fmtNum(FOCUSED_DAY_INCOME)),
      kpiMini('도시1 소요 (레벨1~10)', `${(cum[UPGRADES_PER_HOTEL - 1] / FOCUSED_DAY_INCOME).toFixed(1)} 일`),
      kpiMini('전체 500단계 소요', `${(total / FOCUSED_DAY_INCOME).toFixed(0)} 일`),
      kpiMini('총 누적 비용', fmtNum(total)),
      kpiMini('첫 / 끝 단가', `${fmtNum(unit[0])} / ${fmtNum(unit[N - 1])}`),
      kpiMini('도시당 ↑배율', `×${(cum[UPGRADES_PER_HOTEL * 2 - 1] - cum[UPGRADES_PER_HOTEL - 1] > 0 ? (cum[UPGRADES_PER_HOTEL * 2 - 1] - cum[UPGRADES_PER_HOTEL - 1]) / cum[UPGRADES_PER_HOTEL - 1] : 0).toFixed(1)}`),
    ]),
    h('div', { class: 'cap', html:
      `⭐<b>코인↔비용 비례</b>: 비용은 측정 하루수입(${fmtNum(FOCUSED_DAY_INCOME)})에 앵커. <b>도시1(레벨1~10)=빠른 업그레이드</b>(≈${(cum[UPGRADES_PER_HOTEL - 1] / FOCUSED_DAY_INCOME).toFixed(1)}일), ` +
      `이후 도시마다 가팔라져 <b>코인 부족</b>. 시작코인 5만(첫 2회분)이라 초반부터 벌어 써야 함. (코인 획득은 고변동 유지 — 표시값은 평균.)` }),
    h('div', { class: 'grid cols2' }, [
      h('div', { class: 'card' }, [h('h3', {}, ['단계별 단가 cost(k) — k=1..500']), h('canvas', { id: 'cv_hcost_unit' }), h('div', { class: 'cap' }, ['업그레이드마다 연속 상승(기하). 후반 도시일수록 가파름.'])]),
      h('div', { class: 'card' }, [h('h3', {}, ['누적 비용 Σcost — k=1..500']), h('canvas', { id: 'cv_hcost_cum' }), h('div', { class: 'cap' }, ['전체 코인 싱크 규모(장기 소비처).'])]),
    ]),
    hotelCityTable(unit, cum),
    h('div', { class: 'cap', style: 'margin-top:8px', html: `소스 반영(progression.ts): <code>HOTEL_COST_BASE = ${hotelBase}</code> · <code>HOTEL_COST_GROWTH = ${hotelGrowth}</code>` }),
  );
  drawLines($('cv_hcost_unit') as HTMLCanvasElement, [{ label: 'cost(k)', color: '#ff9e54', points: unit }], { yMin: 0, xLabel: '업그레이드 k(1~500) → 단가' });
  drawLines($('cv_hcost_cum') as HTMLCanvasElement, [{ label: 'Σcost', color: '#5b8cff', points: cum }], { yMin: 0, xLabel: '업그레이드 k(1~500) → 누적' });
}
function kpiMini(label: string, val: string): HTMLElement {
  return h('div', { class: 'kpi' }, [h('div', { class: 'k-label' }, [label]), h('div', { class: 'k-val', style: 'font-size:18px' }, [val])]);
}
function hotelCityTable(unit: number[], cum: number[]): HTMLElement {
  const tbl = h('table', {}, [h('thead', {}, [h('tr', {}, [
    h('th', {}, ['도시']), h('th', {}, ['레벨 범위']),
    h('th', {}, ['시작 단가']), h('th', {}, ['끝 단가']), h('th', {}, ['도시 소계']),
    h('th', {}, ['소요(일)']), h('th', {}, ['누적(일)']),
  ])])]);
  const body = h('tbody', {});
  for (let c = 1; c <= HOTELS_TOTAL; c++) {
    const a = (c - 1) * UPGRADES_PER_HOTEL + 1;
    const b = c * UPGRADES_PER_HOTEL;
    const subtotal = cum[b - 1] - (a > 1 ? cum[a - 2] : 0);
    const lvA = (c - 1) * FACILITIES_PER_HOTEL + 1;
    const lvB = c * FACILITIES_PER_HOTEL;
    const days = subtotal / FOCUSED_DAY_INCOME;
    const cumDays = cum[b - 1] / FOCUSED_DAY_INCOME;
    body.append(h('tr', {}, [
      h('td', {}, [`도시 ${c}`]), h('td', { class: 'muted' }, [`Lv ${lvA}–${lvB}`]),
      h('td', {}, [fmtNum(unit[a - 1])]), h('td', {}, [fmtNum(unit[b - 1])]), h('td', {}, [fmtNum(subtotal)]),
      h('td', { class: c === 1 ? '' : 'muted' }, [`${days < 10 ? days.toFixed(1) : Math.round(days)}일`]),
      h('td', { class: 'muted' }, [`${cumDays < 10 ? cumDays.toFixed(1) : Math.round(cumDays)}일`]),
    ]));
  }
  tbl.append(body);
  return tbl;
}

function sectionTitle(title: string, hint: string): HTMLElement {
  return h('div', { class: 'section' }, [h('h2', {}, [title]), h('span', { class: 'hint' }, [hint])]);
}
function chartCard(title: string, canvasId: string, cap: string): HTMLElement {
  return h('div', { class: 'card' }, [h('h3', {}, [title]), h('canvas', { id: canvasId }), h('div', { class: 'cap' }, [cap])]);
}

/** 맨 위 개요 — 구조와 사용법, 데이터 출처를 명시. */
function introCard(): HTMLElement {
  const sw = (c: string) => h('span', { class: 'sw', style: `background:${c}` });
  return h('div', { class: 'intro' }, [
    h('h3', {}, ['대시보드 개요']),
    h('p', { html: '이 게임의 경제는 <b>스핀(플레이 에너지)</b>으로 라운드를 진행해 <b>코인(소프트 화폐)</b>을 획득하고, 코인으로 <b>도시·호텔(장기 목표)</b>을 성장시키는 구조입니다. 도시 성장은 코인 획득 배수·스핀 보상으로 환원되며, 스핀 소진 시 일일 지급·리그로 보충됩니다.' }),
    h('p', { html: '<b>구성</b> — ① <b>KPI 카드</b>: 현재 상태 요약 · ② <b>건강 점검</b>: 설계 기준 합격/불합격 · ③ <b>차트</b>: 추이 · ④ <b>레버</b>: 파라미터 조정(변경 시 자동 재계산). 각 항목에 설명을 병기했습니다.' }),
    h('p', { html: '<b>데이터 출처</b> — 현재 KPI·점검은 <b>시뮬레이션(AI 최적 플레이)</b> 기반입니다. <b>실측 플레이어 데이터</b>는 하단 전용 섹션에 게임 플레이 시 자동 누적되어 모델과 비교할 수 있습니다.' }),
    h('p', { html: '변경값은 하단 <b>익스포트</b>로 코드(SSOT)에 반영합니다. 콘솔 조정은 즉시 게임에 적용되지 않으며 <b>실험 → 확정 → 반영</b> 순서로 운용합니다.' }),
    h('div', { class: 'legend' }, [
      h('span', {}, [sw('#2ecc8f'), '정상']),
      h('span', {}, [sw('#ffb454'), '주의']),
      h('span', {}, [sw('#ff5d6c'), '점검 필요']),
    ]),
  ]);
}

/** 용어 사전(쉬운 풀이) — 펼침/접힘. */
const GLOSSARY: Array<[string, string, string]> = [
  ['스핀', 'Spin', '라운드 진행에 소모되는 플레이 에너지. 라운드당 베팅 수만큼 차감되며 0이면 진행 불가(일일 지급·리그로 보충).'],
  ['코인 (골드)', 'Coin', '도시·호텔 성장에 소비하는 소프트 화폐. 슬롯·퍼즐·미션으로 획득하며 소비처가 있어 인플레를 허용한다.'],
  ['젬', 'Gem', '상점에서 사용하는 프리미엄 화폐.'],
  ['베팅', 'Bet', '라운드당 투입 스핀 양. 상향 시 코인 획득은 증가하나 스핀 소모도 비례 증가한다.'],
  ['시티레벨', 'City Level', '도시(호텔) 누적 업그레이드 수(0~20). 상승 시 코인 획득 배수·스핀 보상이 증가한다.'],
  ['RTP', '환수율', '베팅 대비 코인 평균 환수율. 130%는 투입 대비 1.3배 환수를 의미(코인은 소프트 화폐라 후한 편).'],
  ['드레인', 'Drain', '라운드당 스핀 순소모율. 0.7×는 베팅의 70% 순감소를 의미한다.'],
  ['톱니 · 업틱', 'sawtooth · uptick', '스핀 잔고의 증감 변동 형태(톱니). 업틱 = 잔고가 증가한 라운드 비율(누적 체감 지표).'],
  ['순스핀 / 일', 'net/day', '1일 플레이 기준 스핀 순증감(+/−).'],
  ['정착(상태)', 'steady-state', '도시 성장 완료 후의 정상 상태. 초반 1회성 보너스를 제외한 장기 흐름.'],
  ['구조 RTP', 'structural RTP', '도시 배수·리그를 제외한 게임 자체의 환수율(기본 수치).'],
  ['α · γ', '알파 · 감마', 'α=시티레벨당 코인 획득 배수 증가, γ=시티레벨당 비용 증가 배수. γ>α 유지 시 목표가 영속된다.'],
  ['T(n)', '업그레이드 소요', 'n번째 도시 업그레이드까지의 상대 소요. 단조 증가가 정상.'],
  ['M(L)', '코인획득 배수', '시티레벨 L의 코인 획득 배수. 도시 성장에 비례한다.'],
  ['오브젝트별', 'per-object', '호텔 5개 오브젝트를 각각 독립 레벨로 업그레이드(오브젝트별 개별 비용).'],
  ['분할 방식', 'amortization', '리그 보상(주 1회 정산)을 시뮬에 매일/매라운드/일괄 중 어떤 방식으로 분산 반영할지.'],
  ['리그 기대주입', 'expected injection', '평균 플레이어가 1주에 리그로 수령할 것으로 기대되는 스핀·코인 추정량.'],
];
function glossaryCard(): HTMLElement {
  const det = h('details', { class: 'help', open: true }, [h('summary', {}, ['▸ 용어 사전 펼치기 / 접기'])]);
  const grid = h('div', { class: 'help-grid' });
  for (const [name, en, def] of GLOSSARY) {
    grid.append(h('div', { class: 'term' }, [
      h('div', { class: 't-name' }, [name, h('span', {}, [`  ${en}`])]),
      h('div', { class: 't-def' }, [def]),
    ]));
  }
  det.append(grid);
  return h('div', { class: 'card' }, [det]);
}

// ── KPI ──
function renderKpis(): void {
  const b = lastBundle;
  if (!b) return;
  const k = kpisFromBundle(ws, b);
  const daily = ws.params.dailySpins;
  const netCls = k.netSpinPerDay >= -0.6 * daily && k.netSpinPerDay <= 0.5 * daily ? 'good' : 'bad';
  const drainCls = k.drainFactor >= 0.3 && k.drainFactor <= 0.9 ? 'good' : 'bad';
  const upCls = k.uptickRatio >= 0.04 && k.uptickRatio <= 0.4 ? 'good' : 'warn';
  const rtpCls = k.rtpBase >= 0.9 && k.rtpBase <= 1.7 ? 'good' : 'warn';
  const cityLv = lastProg ? lastProg.cityLevel : 0;
  const cards: Array<[string, string, string, string]> = [
    ['정착 순스핀 / 일', fmtSigned(k.netSpinPerDay), '호텔 1회성 제외. 음수=순감소(목표)', netCls],
    ['플레이 드레인', `${k.drainFactor.toFixed(2)}×`, '베팅 대비 라운드 순소모(0.3~0.9)', drainCls],
    ['톱니 업틱', `${(k.uptickRatio * 100).toFixed(0)}%`, '잔고 상승 라운드(쌓이는 느낌)', upCls],
    ['구조 RTP', `${(k.rtpBase * 100).toFixed(0)}%`, 'AI 최적 결합(0.90~1.45)', rtpCls],
    ['시티레벨 도달', cityLv.toFixed(1), `/${ws.params.maxCityLevel} (빌드 시뮬)`, ''],
    ['리그 Δ 스핀/일', ws.league.enabled ? fmtSigned(k.leagueDeltaSpinPerDay) : 'OFF', '리그 ON−OFF 차이', ws.league.enabled ? 'good' : ''],
  ];
  const root = $('kpis');
  root.innerHTML = '';
  for (const [label, val, sub, cls] of cards) {
    root.append(h('div', { class: `kpi ${cls}` }, [
      h('div', { class: 'k-label' }, [label]), h('div', { class: 'k-val' }, [val]), h('div', { class: 'k-sub' }, [sub]),
    ]));
  }
}

// ── 헬스체크 배지 ──
function renderPills(checks: CheckResult[]): void {
  const root = $('pills');
  root.innerHTML = '';
  for (const c of checks) {
    root.append(h('div', { class: `pill ${c.pass ? 'ok' : 'fail'}` }, [
      h('div', { class: 'dot' }),
      h('div', { class: 'p-body' }, [
        h('div', { class: 'p-label' }, [(c.severity === 'critical' ? '● ' : '') + c.label]),
        h('div', { class: 'p-val' }, [`${c.valueStr}  ·  목표 ${c.targetStr}`]),
        h('div', { class: 'p-why' }, [c.rationale]),
        ...(PLAIN_HELP[c.id] ? [h('div', { class: 'p-plain' }, [PLAIN_HELP[c.id]])] : []),
        ...(!c.pass && c.severity === 'critical' ? [h('div', { class: 'p-crit' }, ['⚠ CRITICAL — 설계 위반'])] : []),
      ]),
    ]));
  }
}

// ── 닫힌형 차트(즉시) ──
function updateCheap(): void {
  const p = ws.params;
  const Ls = Array.from({ length: p.maxCityLevel + 1 }, (_, i) => i);
  drawLines($('cv_cost') as HTMLCanvasElement, [
    { label: 'Cost(L)', color: '#ff9e54', points: Ls.map((L) => cityCostP(p, L)) },
  ], { yMin: 0, xLabel: '시티레벨 L → 비용(코인)' });
  drawLines($('cv_tn') as HTMLCanvasElement, [
    { label: 'T(n)', color: '#5b8cff', points: Ls.map((L) => cityCostP(p, L) / incomeMultP(p, L)) },
  ], { yMin: 0, xLabel: '시티레벨 L → 상대 소요' });
  const contrib = bandContributions({ ...ws.league, enabled: true });
  drawBars($('cv_league') as HTMLCanvasElement, contrib.map((c, i) => ({
    label: c.label.split(' ')[0], value: c.spins, color: ['#38d39f', '#5b8cff', '#ffce5c', '#ff9e54', '#ff5d6c'][i % 5],
  })), { fmt: (v) => fmtNum(v) });
  // 레버 배지(변경 표시)
  refreshLeverBadges();
  refreshMissionPreview();
  $('exportpre').textContent = previewSummary();
}

// ── 시뮬(디바운스) ──
type Sim = ReturnType<typeof simulate>;
let lastBundle: ReturnType<typeof runBundle> | null = null;
let lastProg: Sim | null = null; // 진행(빌드ON) 시뮬 — 톱니·유입구성·시티레벨
let lastProgOn: Sim | null = null;
function recomputeSim(now = false): void {
  if (simTimer) clearTimeout(simTimer);
  $('busy').classList.add('on');
  const run = () => {
    try {
      lastBundle = runBundle(ws, 2, 1500);
      lastProg = simulate(ws.params, progOpts(false));
      lastProgOn = ws.league.enabled ? simulate(ws.params, progOpts(true)) : null;
      renderKpis();
      renderPills([...formulaChecks(ws), ...simChecksFromBundle(ws, lastBundle)]);
      renderTrajectory();
      renderSources();
    } finally {
      $('busy').classList.remove('on');
    }
  };
  simTimer = window.setTimeout(run, now ? 30 : 480);
}

// 진행(빌드ON·현실 막힘) 시뮬 — 호텔을 실제로 짓는 톱니 형태(초중반 상승 → 후반 드레인) + 유입구성/시티레벨.
function progOpts(leagueOn: boolean): SimOptions {
  return { rounds: 2200, seed: 99, roundsPerDay: 50, league: { ...ws.league, enabled: leagueOn },
    autoBuildHotel: true, allowNegative: false, sampleEvery: 14 };
}
function renderTrajectory(): void {
  const series = [{ label: '리그 OFF', color: '#5b8cff', points: lastProg ? lastProg.trajectory : [] }];
  if (lastProgOn) series.push({ label: '리그 ON', color: '#38d39f', points: lastProgOn.trajectory });
  drawLines($('cv_saw') as HTMLCanvasElement, series, { yMin: 0, zeroLine: true, xLabel: '라운드(14R 간격) → 스핀 잔고' });
}
function renderSources(): void {
  if (!lastProg) return;
  const s = lastProg.spinSources;
  drawBars($('cv_src') as HTMLCanvasElement, [
    { label: '젬환급', value: s.gem, color: '#38d39f' },
    { label: '대박', value: s.bigwin, color: '#ffce5c' },
    { label: '어택', value: s.attack, color: '#ff7a52' },
    { label: '미션', value: s.mission, color: '#5b8cff' },
    { label: '호텔', value: s.hotel, color: '#ff9e54' },
    { label: '데일리', value: s.daily, color: '#9b7bff' },
    { label: '리그', value: s.league, color: '#ff5d6c' },
  ], { fmt: (v) => fmtNum(v) });
}

// ── 레버 패널 ──
const leverInputs = new Map<string, { range: HTMLInputElement; num: HTMLInputElement; badge: HTMLElement }>();
function renderLevers(): void {
  const root = $('levers');
  root.innerHTML = '';
  leverInputs.clear();
  const groups: LeverGroup[] = ['spins', 'coin', 'progression', 'league', 'sim'];
  for (const g of groups) {
    const items = LEVERS.filter((l) => l.group === g);
    if (!items.length) continue;
    const card = h('div', { class: 'card' }, [h('h3', {}, [GROUP_LABELS[g]])]);
    for (const lv of items) {
      const cur = lv.get(ws);
      const badge = h('span', { class: 'l-ssot' }, ['']);
      const range = h('input', { type: 'range', min: lv.min, max: lv.max, step: lv.step, value: cur }) as HTMLInputElement;
      const num = h('input', { type: 'number', min: lv.min, max: lv.max, step: lv.step, value: cur }) as HTMLInputElement;
      const onChange = (val: number) => {
        const v = clamp(val, lv.min, lv.max);
        lv.set(ws, v); range.value = String(v); num.value = String(v);
        saveWorking(ws); updateCheap(); recomputeSim();
      };
      range.addEventListener('input', () => onChange(Number(range.value)));
      num.addEventListener('change', () => onChange(Number(num.value)));
      leverInputs.set(lv.id, { range, num, badge });
      card.append(h('div', { class: 'lever' }, [
        h('div', { class: 'l-top' }, [h('span', { class: 'l-name' }, [lv.label]), badge]),
        h('div', { class: 'l-ctrl' }, [range, num, h('span', { class: 'muted', html: lv.unit ? `&nbsp;${lv.unit}` : '' })]),
        h('div', { class: 'l-drives' }, [lv.drives]),
      ]));
    }
    root.append(card);
  }
}
function refreshLeverBadges(): void {
  const ssot = ssotWorking();
  for (const lv of LEVERS) {
    const ui = leverInputs.get(lv.id);
    if (!ui) continue;
    const cur = lv.get(ws), base = lv.get(ssot);
    const changed = Math.abs(cur - base) > 1e-9;
    ui.badge.className = changed ? 'l-changed' : 'l-ssot';
    ui.badge.textContent = changed ? `변경됨 (SSOT ${base})` : (lv.srcName ? `SSOT ${base}` : `기본 ${base}`);
  }
}
const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

// ── 미션 표 ──
function renderMissions(): void {
  const root = $('missions');
  root.innerHTML = '';
  const tbl = h('table', {}, [
    h('thead', {}, [h('tr', {}, [
      h('th', {}, ['#']), h('th', {}, ['목표(젬×베팅)']), h('th', {}, ['보상종류']), h('th', {}, ['보상액']), h('th', {}, ['L20 목표(스케일)']),
    ])]),
  ]);
  const body = h('tbody', {});
  ws.params.missions.forEach((m, i) => {
    const tgt = h('input', { type: 'number', value: m.target, min: 0, step: 50 }) as HTMLInputElement;
    const amt = h('input', { type: 'number', value: m.rewardAmount, min: 0, step: 50 }) as HTMLInputElement;
    const scaled = h('td', { class: 'muted', id: `mt_${i}` }, [String(missionTargetP(ws.params, m.target, ws.params.maxCityLevel))]);
    tgt.addEventListener('change', () => { setMission(i, { target: clamp(Number(tgt.value), 0, 1e9) }); });
    amt.addEventListener('change', () => { setMission(i, { rewardAmount: clamp(Number(amt.value), 0, 1e12) }); });
    body.append(h('tr', {}, [
      h('td', {}, [`m${i}`]), h('td', {}, [tgt]),
      h('td', { class: m.rewardKind === 'spins' ? '' : 'muted' }, [m.rewardKind === 'spins' ? '🎰 스핀' : '🪙 코인']),
      h('td', {}, [amt]), scaled,
    ]));
  });
  tbl.append(body);
  root.append(tbl);
}
function setMission(i: number, patch: Partial<{ target: number; rewardAmount: number }>): void {
  const missions = ws.params.missions.map((m, j) => (j === i ? { ...m, ...patch } : m));
  ws.params = { ...ws.params, missions };
  saveWorking(ws); updateCheap(); recomputeSim();
}
function refreshMissionPreview(): void {
  ws.params.missions.forEach((m, i) => {
    const td = document.getElementById(`mt_${i}`);
    if (td) td.textContent = String(missionTargetP(ws.params, m.target, ws.params.maxCityLevel));
  });
}

// ── 리그 패널 ──
function renderLeague(): void {
  const root = $('league');
  root.innerHTML = '';
  const lg = ws.league;
  const en = h('input', { type: 'checkbox', ...(lg.enabled ? { checked: true } : {}) }) as HTMLInputElement;
  en.addEventListener('change', () => { ws.league = { ...ws.league, enabled: en.checked }; saveWorking(ws); updateCheap(); recomputeSim(); });
  const amort = h('select', {}, ['per-day', 'per-round', 'lumpy'].map((m) => h('option', { value: m, ...(lg.amortization === m ? { selected: true } : {}) }, [m]))) as HTMLSelectElement;
  amort.addEventListener('change', () => { ws.league = { ...ws.league, amortization: amort.value as 'per-day' | 'per-round' | 'lumpy' }; saveWorking(ws); recomputeSim(); });

  const summary = h('div', { class: 'cap', id: 'league_sum' }, ['']);
  const bandTbl = h('table', {}, [h('thead', {}, [h('tr', {}, [
    h('th', {}, ['밴드']), h('th', {}, ['도달%']), h('th', {}, ['스핀(Gold)']), h('th', {}, ['코인(Gold)']),
  ])])]);
  const bbody = h('tbody', {});
  lg.bands.forEach((bd, i) => {
    const sp = h('input', { type: 'number', value: bd.spinBase, min: 0, step: 50 }) as HTMLInputElement;
    const co = h('input', { type: 'number', value: bd.coinBase, min: 0, step: 100000 }) as HTMLInputElement;
    sp.addEventListener('change', () => setBand(i, { spinBase: clamp(Number(sp.value), 0, 1e7) }));
    co.addEventListener('change', () => setBand(i, { coinBase: clamp(Number(co.value), 0, 1e10) }));
    bbody.append(h('tr', {}, [h('td', {}, [bd.label]), h('td', { class: 'muted' }, [`${(bd.fraction * 100).toFixed(0)}%`]), h('td', {}, [sp]), h('td', {}, [co])]));
  });
  bandTbl.append(bbody);

  root.append(
    h('div', { class: 'l-ctrl' }, [
      h('label', { class: 'toggle' }, [en, '리그 활성']),
      h('span', { class: 'muted', html: '&nbsp;&nbsp;정산:' }), amort,
    ]),
    sliderRow('참여율', lg.participation, 0, 1, 0.05, (v) => { ws.league = { ...ws.league, participation: v }; saveWorking(ws); updateCheap(); recomputeSim(); }),
    sliderRow('주기(일)', lg.periodDays, 1, 30, 1, (v) => { ws.league = { ...ws.league, periodDays: v }; saveWorking(ws); updateCheap(); recomputeSim(); }),
    summary, bandTbl,
  );
  updateLeagueSummary();
}
function setBand(i: number, patch: Partial<{ spinBase: number; coinBase: number }>): void {
  const bands = ws.league.bands.map((b, j) => (j === i ? { ...b, ...patch } : b));
  ws.league = { ...ws.league, bands };
  saveWorking(ws); updateCheap(); recomputeSim(); updateLeagueSummary();
}
function updateLeagueSummary(): void {
  const el = document.getElementById('league_sum');
  if (!el) return;
  const on = { ...ws.league, enabled: true };
  el.textContent = `기대 주입/주(평균 플레이어): ${Math.round(expectedSpinPerPeriod(on))} 스핀 · ${fmtNum(expectedCoinPerPeriod(on))} 코인  →  일평탄 ${Math.round(expectedSpinPerPeriod(on) / on.periodDays)} 스핀/일`;
}
function sliderRow(label: string, val: number, min: number, max: number, step: number, on: (v: number) => void): HTMLElement {
  const range = h('input', { type: 'range', min, max, step, value: val }) as HTMLInputElement;
  const num = h('input', { type: 'number', min, max, step, value: val }) as HTMLInputElement;
  const sync = (v: number) => { const c = clamp(v, min, max); range.value = String(c); num.value = String(c); on(c); };
  range.addEventListener('input', () => sync(Number(range.value)));
  num.addEventListener('change', () => sync(Number(num.value)));
  return h('div', { class: 'lever' }, [h('div', { class: 'l-top' }, [h('span', { class: 'l-name' }, [label])]), h('div', { class: 'l-ctrl' }, [range, num])]);
}

// ── 변경 기록 ──
function renderChangelog(): void {
  const root = $('changelog');
  root.innerHTML = '';
  const note = h('textarea', { placeholder: '이 변경의 사유/판단을 적으세요 (예: "고베팅 이탈 완화 위해 환급계수 2→3, 드레인 0.6 목표")' }) as HTMLTextAreaElement;
  const rec = h('button', { class: 'btn primary', onclick: () => {
    const diffs = diffFromSsot(ws);
    if (!diffs.length && !note.value.trim()) return;
    appendChangelog({ ts: Date.now(), note: note.value.trim() || '(사유 없음)', diffs });
    note.value = ''; renderList();
  } }, ['기록 추가']);
  const clr = h('button', { class: 'btn danger ghost', onclick: () => { if (confirm('기록 전체 삭제?')) { clearChangelog(); renderList(); } } }, ['기록 비우기']);
  const list = h('div', { id: 'log_list' });
  root.append(note, h('div', { class: 'l-ctrl' }, [rec, clr]), h('div', { style: 'height:10px' }), list);
  renderList();

  function renderList(): void {
    const log = loadChangelog();
    list.innerHTML = '';
    if (!log.length) { list.append(h('div', { class: 'muted' }, ['아직 기록이 없습니다.'])); return; }
    for (const e of log) list.append(renderEntry(e));
  }
}
function renderEntry(e: ChangeEntry): HTMLElement {
  const when = new Date(e.ts).toLocaleString('ko-KR');
  const diffTxt = e.diffs.length ? e.diffs.map((d) => `${d.label} ${d.from}→${d.to}`).join(' · ') : 'SSOT 대비 변경 없음';
  return h('div', { class: 'log-item' }, [
    h('div', { class: 'l-ts' }, [when]),
    h('div', { class: 'l-note' }, [e.note]),
    h('div', { class: 'l-diff' }, [diffTxt]),
  ]);
}

// ── 실측 플레이어 데이터 ──
function renderObserved(): void {
  const root = $('observed');
  root.innerHTML = '';
  const sum = observedSummary();
  const bar = h('div', { class: 'l-ctrl' }, [
    h('button', { class: 'btn', onclick: () => renderObserved() }, ['↻ 새로고침']),
    h('button', { class: 'btn danger ghost', onclick: () => { if (confirm('수집된 실측 데이터를 비웁니다.')) { clearTelemetry(); renderObserved(); } } }, ['데이터 비우기']),
  ]);
  if (!sum) {
    root.append(
      h('div', { class: 'muted', html: '아직 수집된 플레이 데이터가 없습니다. 게임을 플레이하면 라운드마다 자동 누적되며(같은 브라우저 origin 공유), [새로고침]으로 반영됩니다.<br>현재 KPI·점검은 시뮬레이션(모델) 기반이고, 이 섹션은 향후 <b>실측 → 모델 보정</b> 확장의 토대입니다.' }),
      h('div', { style: 'height:10px' }), bar,
    );
    return;
  }
  const cards: Array<[string, string, string]> = [
    ['수집 라운드', sum.rounds.toLocaleString('en-US'), `기간 ${sum.days.toFixed(1)}일`],
    ['실측 순스핀/일', fmtSigned(sum.netSpinPerDay), '모델 KPI(시뮬)와 대조'],
    ['실측 코인 RTP', `${(sum.coinRtp * 100).toFixed(0)}%`, '획득코인 ÷ 베팅'],
    ['실측 업틱', `${(sum.uptickRatio * 100).toFixed(0)}%`, '스핀 증가 라운드 비율'],
    ['현재 스핀 / 코인', `${fmtNum(sum.spins)} / ${fmtNum(sum.coins)}`, `시티레벨 ${sum.cityLevel}`],
  ];
  const grid = h('div', { class: 'kpis' });
  for (const [l, v, s] of cards) grid.append(h('div', { class: 'kpi' }, [h('div', { class: 'k-label' }, [l]), h('div', { class: 'k-val' }, [v]), h('div', { class: 'k-sub' }, [s])]));
  root.append(grid, h('div', { class: 'cap', html: '실측치는 모델(시뮬) 가정의 검증·보정용입니다. 모델과 크게 벌어지면 레버를 실측에 맞춰 조정하세요. (향후 자동 보정으로 확장 예정.)' }), h('div', { style: 'height:8px' }), bar);
}

// ── 익스포트 / 리셋 ──
function previewSummary(): string {
  const d = diffFromSsot(ws);
  if (!d.length) return '현재 작업셋 = SSOT(라이브 게임) 기본값. 변경 없음.';
  return `SSOT 대비 변경 ${d.length}개:\n` + d.map((x) => `  · ${x.label}: ${x.from} → ${x.to}`).join('\n') + '\n\n[💾 JSON] 또는 [⧉ 소스 diff] 로 내보내세요.';
}
function showJSON(): void { setExport(exportJSON(ws)); }
function showDiff(): void { setExport(exportSourceDiff(ws)); }
function setExport(text: string): void {
  $('exportpre').textContent = text;
  navigator.clipboard?.writeText(text).then(() => toast('클립보드 복사됨')).catch(() => {});
}
function doReset(): void {
  if (!confirm('작업셋을 SSOT(라이브 게임) 기본값으로 되돌립니다. (변경 기록은 유지)')) return;
  resetWorking();
  ws = ssotWorking();
  build();
}
function toast(msg: string): void {
  const t = h('div', { class: 'busy on' }, [msg]);
  document.body.append(t);
  setTimeout(() => t.remove(), 1400);
}

build();
