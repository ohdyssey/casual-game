/**
 * reward/shell — CashPOP 인앱 리워드 셸(전체화면 오버레이).
 *
 * 방향: 허브=리워드 플랫폼, 게임=종속 미니게임. 그리드 1번 CashPOP 카드로 이 셸을 연다.
 * 디자인: 제공된 CashPOP 목업(라이트 테마·파란 포인트).
 *
 * 통화 이중화(직접 현금 지급 금지):
 *   💎 다이아 = 환전 가능 보상 재화(모든 미션/광고/시즌 보상) → 교환소에서 캐시(원) 전환 → 출금.
 *   🏆 P     = 랭킹 전용 포인트(환전 불가, 주간 시즌 리셋) — league.ts.
 *   홈 = 다이아카드(교환하기) → 오늘의 적립 현황 → 리그 카드 → 광고 배너 → 오늘의 미션 → 이벤트.
 *   하단 5탭: 홈/리그/광고/교환소/더보기.
 * Phase A(프론트 mock): 잔액/적립은 localStorage. 실정산은 Phase B(백엔드).
 *
 * ⚠️ 게임 실행은 **기존 방식(launchGame) 그대로** 사용 — 변경 금지(그리드 카드와 동일 경로).
 */
import { toast } from '../account.js';
import { GAMES } from '../../games.config.js';
import { launchGame, isPlayable } from '../launcher.js';
import { loadIdentity } from '../leaderboard.js';
import {
  MISSIONS,
  GOAL_DIA,
  WITHDRAW_MIN,
  ROULETTE_PRIZES,
  AD_DICE,
  AD_PTS,
  GAME_MIN_PLAY_MS,
  DIA_PER_WON,
  EXCHANGE_MIN_DIA,
  EXCHANGE_UNIT_DIA,
  type Mission,
} from './data.js';
import { addDice, addPts, settleIfNeeded, slotBonus, withSlotBonus, type SeasonResult } from './league.js';
import { leagueHomeCard, renderLeague } from './leagueView.js';
import { playAd } from './adPlayer.js';
import { ensureCashpopGate } from './gate.js';

type View = 'home' | 'league' | 'ad' | 'cash' | 'friends' | 'more';

/** 미션 완료 지급 콜백(캐시+리그 P 병행). */
type CompleteFn = (id: string, amount: number, label?: string, pts?: number) => void;

interface GameEntry {
  id: string;
  title: string;
  live: boolean;
  devPort?: number;
  prodUrl?: string;
}

/* ── 지갑 목 저장 — 실정산은 Phase B ── */
/** 💎 다이아(환전 가능 보상 재화) — 모든 지급의 1차 도착지. */
const DIA_KEY = 'cashpop_dia_v1';
/** 💵 캐시(원) — 교환소 전환으로만 증가하는 출금 대기 잔액. */
const CASH_KEY = 'cashpop_cash_v1';
/** '오늘' 스코프 저장(자정 리셋): 오늘 적립 다이아 / 완료 미션 / P 2배 수령 미션. */
const TODAY_KEY = 'cashpop_today_v3';
const DONE_KEY = 'cashpop_done_v2';
const DOUBLE_KEY = 'cashpop_double_v2';
/** 게임 미션 실행 마커 — 같은 창 이동이라 복귀(다음 셸 오픈) 때 회수해 지급 판정. */
const PENDING_KEY = 'cashpop_pending_game_v1';
const num = (k: string): number => {
  try {
    return Number(localStorage.getItem(k)) || 0;
  } catch {
    return 0;
  }
};
const setNum = (k: string, v: number): void => {
  try {
    localStorage.setItem(k, String(v));
  } catch {
    /* 무시 */
  }
};

/** 로컬 자정 기준 오늘 날짜 키('2026-07-06') — 일일 미션 리셋 축. */
const dayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** 날짜 스코프 id 집합 — 저장된 날짜가 오늘이 아니면 빈 집합(=자정 자동 리셋). */
const dailySet = (key: string): Set<string> => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null') as { d?: string; ids?: string[] } | null;
    return raw && raw.d === dayStr() && Array.isArray(raw.ids) ? new Set(raw.ids) : new Set();
  } catch {
    return new Set();
  }
};
const saveDailySet = (key: string, s: Set<string>): void => {
  try {
    localStorage.setItem(key, JSON.stringify({ d: dayStr(), ids: [...s] }));
  } catch {
    /* 무시 */
  }
};
const doneSet = (): Set<string> => dailySet(DONE_KEY);
const saveDone = (s: Set<string>): void => saveDailySet(DONE_KEY, s);
const doubledSet = (): Set<string> => dailySet(DOUBLE_KEY);
const saveDoubled = (s: Set<string>): void => saveDailySet(DOUBLE_KEY, s);

/** 오늘 적립 다이아(💎) — 날짜가 바뀌면 0부터. */
const todayDia = (): number => {
  try {
    const raw = JSON.parse(localStorage.getItem(TODAY_KEY) || 'null') as { d?: string; dia?: number } | null;
    return raw && raw.d === dayStr() ? Number(raw.dia) || 0 : 0;
  } catch {
    return 0;
  }
};
const addTodayDia = (n: number): void => {
  try {
    localStorage.setItem(TODAY_KEY, JSON.stringify({ d: dayStr(), dia: todayDia() + n }));
  } catch {
    /* 무시 */
  }
};

const won = (n: number): string => `${n.toLocaleString()}원`;
const dia = (n: number): string => `${n.toLocaleString()}💎`;
const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** 라이트 테마 스타일 1회 주입(scoped `.rw-*`, 전역 다크 변수 미사용). */
function injectStyles(): void {
  if (document.getElementById('rw-styles')) return;
  const s = document.createElement('style');
  s.id = 'rw-styles';
  s.textContent = `
    .rw-layer{position:fixed;inset:0;z-index:1500;display:flex;flex-direction:column;background:#F4F6FA;color:#1B2438;
      font-family:'Do Hyeon',system-ui,sans-serif;animation:rw-in .22s ease}
    @keyframes rw-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    .rw-body{flex:1;overflow-y:auto;padding:16px 16px 92px;max-width:520px;width:100%;margin:0 auto;scrollbar-width:none;-ms-overflow-style:none}
    .rw-body::-webkit-scrollbar{display:none;width:0;height:0}
    .rw-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px}
    .rw-logo{width:150px;height:auto;display:block;margin:-6px 0 -4px -4px}
    .rw-bell{position:relative;width:42px;height:42px;border-radius:14px;border:1px solid #E7EBF2;background:#fff;font-size:19px;cursor:pointer}
    .rw-bell i{position:absolute;top:9px;right:10px;width:7px;height:7px;border-radius:50%;background:#FF4D4F}
    /* 허브로 가기 — 모든 탭에서 보이는 셸 상단 우측 고정 버튼(게임과 동일 그리드 아이콘). 클릭=셸 닫고 허브로. */
    .rw-hubback{position:absolute;top:calc(env(safe-area-inset-top,0px) + 14px);right:16px;z-index:20;width:40px;height:40px;
      border-radius:50%;border:1px solid #E7EBF2;background:#fff;color:#1B2438;display:flex;align-items:center;justify-content:center;
      cursor:pointer;box-shadow:0 4px 12px rgba(20,30,60,.12)}
    .rw-hubback svg{width:20px;height:20px}
    .rw-hubback:active{transform:scale(.92)}
    .rw-hello{font-size:22px;color:#1B2438;margin:8px 2px 2px}
    .rw-hello b{color:#2E6BFF;font-weight:800}
    .rw-hello2{color:#8A94A6;font-size:14px;margin:0 2px 16px}
    /* 캐시 카드(파랑=원) / 다이아 카드(보라=환전 재화) */
    .rw-cash{border-radius:22px;padding:20px;color:#fff;margin-bottom:16px;
      background:linear-gradient(135deg,#3B82F6,#2563EB);box-shadow:0 14px 30px rgba(37,99,235,.32)}
    .rw-cash.dia{background:linear-gradient(135deg,#7C5CFF,#4A6CFF);box-shadow:0 14px 30px rgba(92,92,255,.32)}
    .rw-cash-top{display:flex;align-items:center;justify-content:space-between;font-size:15px}
    .rw-cash-top .wd{background:rgba(255,255,255,.18);border:0;color:#fff;font-family:inherit;font-size:13.5px;padding:8px 13px;border-radius:999px;cursor:pointer}
    .rw-cash-amt{font-size:42px;font-weight:800;margin:8px 0 14px;letter-spacing:-1px}
    .rw-cash-amt small{font-size:22px;font-weight:400;margin-left:2px}
    .rw-cash-foot{display:flex;gap:10px;background:rgba(255,255,255,.14);border-radius:14px;padding:11px 14px;font-size:12.5px}
    .rw-cash-foot span{flex:1;text-align:center}
    .rw-cash-foot span+span{border-left:1px solid rgba(255,255,255,.25)}
    /* 카드 공통 */
    .rw-panel{background:#fff;border-radius:20px;padding:18px;margin-bottom:16px;box-shadow:0 8px 22px rgba(20,30,60,.06)}
    .rw-panel-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
    .rw-panel-h b{font-size:16px;color:#1B2438}
    .rw-earn{display:flex}
    .rw-earn-col{flex:1;display:flex;align-items:center;gap:11px}
    .rw-earn-col+.rw-earn-col{border-left:1px solid #EEF1F6;padding-left:16px}
    .rw-earn-col .ic{font-size:30px}
    .rw-earn-col small{display:block;color:#8A94A6;font-size:12.5px}
    .rw-earn-col b{font-size:22px;color:#2E6BFF}
    .rw-bar{height:8px;border-radius:999px;background:#EDF0F5;margin:14px 0 6px;overflow:hidden}
    .rw-bar i{display:block;height:100%;background:linear-gradient(90deg,#3B82F6,#2563EB);border-radius:999px;transition:width .4s ease}
    .rw-goal{text-align:right;color:#8A94A6;font-size:12.5px}
    /* 광고 배너 */
    .rw-adbn{width:100%;display:flex;align-items:center;gap:14px;border:0;cursor:pointer;font-family:inherit;text-align:left;
      border-radius:20px;padding:16px 18px;margin-bottom:16px;color:#fff;background:linear-gradient(135deg,#3B82F6,#2563EB);box-shadow:0 10px 22px rgba(37,99,235,.28)}
    .rw-adbn .pl{width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:18px;flex:none}
    .rw-adbn .tx{flex:1}
    .rw-adbn .tx b{display:block;font-size:17px}
    .rw-adbn .tx span{display:block;font-size:12.5px;opacity:.85;margin-top:2px}
    .rw-adbn .rw-pill{flex:none;background:#FFD24A;color:#5a3a06;font-size:13px;padding:8px 12px;border-radius:999px}
    /* 미션 리스트 */
    .rw-h2{display:flex;align-items:center;justify-content:space-between;margin:4px 2px 10px;font-size:16px;color:#1B2438}
    .rw-h2 small{color:#8A94A6;font-size:12.5px}
    .rw-mission{display:flex;align-items:center;gap:12px;background:#fff;border-radius:16px;padding:13px 14px;margin-bottom:9px;box-shadow:0 6px 16px rgba(20,30,60,.05)}
    .rw-mission.done{opacity:.55}
    .rw-mission .no{flex:none;width:24px;height:24px;border-radius:50%;background:#EAF1FF;color:#2E6BFF;font-size:12px;display:flex;align-items:center;justify-content:center}
    .rw-mission.done .no{background:#E7F7EE;color:#28a745}
    .rw-mission .ic{font-size:24px;flex:none}
    .rw-mission .tx{flex:1;min-width:0}
    .rw-mission .tx b{display:block;font-size:15px;color:#1B2438;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rw-mission .tx span{display:block;font-size:12.5px;color:#8A94A6;margin-top:2px}
    .rw-mbtn{flex:none;font-family:inherit;cursor:pointer;border:0;border-radius:12px;padding:9px 13px;font-size:13px;
      background:#2E6BFF;color:#fff;white-space:nowrap}
    .rw-mbtn em{font-style:normal;font-weight:800;margin-left:4px}
    .rw-mbtn:disabled{background:#E7F7EE;color:#28a745;cursor:default}
    .rw-mbtn.dbl{background:linear-gradient(135deg,#7C5CFF,#4A6CFF)}
    /* 셸 내부 모달(시즌 정산 등) */
    .rw-modal{position:absolute;inset:0;z-index:40;background:rgba(15,22,45,.5);display:flex;align-items:center;justify-content:center;animation:rw-in .2s ease}
    .rw-modal .bx{background:#fff;border-radius:24px;padding:26px 22px 20px;width:min(330px,88%);text-align:center;box-shadow:0 24px 60px rgba(10,20,50,.35)}
    .rw-modal .big{font-size:44px}
    .rw-modal .tt{display:block;font-size:20px;color:#1B2438;margin:6px 0 10px;font-weight:800}
    .rw-modal .row{color:#5A6478;font-size:14.5px}
    .rw-modal .row b{color:#7C5CFF}
    .rw-modal .cash{font-size:26px;color:#2E6BFF;font-weight:800;margin:8px 0 2px}
    .rw-modal p{color:#8A94A6;font-size:12.5px;margin:8px 0 2px}
    .rw-modal .wheel{display:inline-block;animation:rw-spin .5s linear infinite}
    @keyframes rw-spin{to{transform:rotate(360deg)}}
    /* 이벤트 배너 */
    .rw-event{display:flex;align-items:center;gap:12px;background:#FFF6E0;border:1px solid #FDE9BE;border-radius:18px;padding:15px 16px;margin-top:4px}
    .rw-event .tx{flex:1}
    .rw-event .tx small{color:#C08A1E;font-size:12px}
    .rw-event .tx b{display:block;color:#1B2438;font-size:16px;margin:2px 0}
    .rw-event .tx span{color:#8A94A6;font-size:12.5px}
    .rw-event .go{flex:none;width:36px;height:36px;border-radius:50%;background:#fff;border:1px solid #FDE9BE;font-size:16px;cursor:pointer}
    /* 리스트 로우(내 캐시/친구/더보기) */
    .rw-lr{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border-radius:14px;padding:15px 16px;margin-bottom:9px;box-shadow:0 6px 16px rgba(20,30,60,.05)}
    .rw-lr b{color:#1B2438;font-weight:400}
    .rw-lr small{display:block;color:#8A94A6;font-size:12.5px;margin-top:3px}
    .rw-cta{width:100%;font-family:inherit;cursor:pointer;border:0;border-radius:16px;padding:16px;font-size:17px;color:#fff;
      background:linear-gradient(135deg,#3B82F6,#2563EB);box-shadow:0 10px 22px rgba(37,99,235,.28);margin:4px 0 14px}
    .rw-cta:disabled{background:#C7CDD8;box-shadow:none;cursor:default}
    .rw-note{color:#9AA3B2;font-size:12.5px;text-align:center;margin:12px 0}
    /* 하단 탭 */
    .rw-nav{position:absolute;left:0;right:0;bottom:0;display:flex;background:#fff;border-top:1px solid #EDF0F5;padding-bottom:env(safe-area-inset-bottom,0px)}
    .rw-nav button{flex:1;background:none;border:0;color:#9AA3B2;font-family:inherit;font-size:11px;padding:9px 0 11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px}
    .rw-nav button .ni{font-size:20px}
    .rw-nav button.on{color:#2E6BFF}
  `;
  document.head.appendChild(s);
}

/**
 * CashPOP 리워드 셸 열기.
 *   onClose — 셸이 닫힐 때 호출(허브 지갑바 새로고침).
 */
export function openRewardShell(onClose?: () => void): void {
  // 접속 비밀번호 게이트 — 미통과 시 폼을 띄우고 통과 후 이 함수를 재호출(셸 마운트는 그때).
  if (!ensureCashpopGate(() => openRewardShell(onClose))) return;

  injectStyles();
  document.querySelectorAll('.rw-layer').forEach((el) => el.remove());

  const layer = document.createElement('div');
  layer.className = 'rw-layer';
  layer.innerHTML =
    `<button class="rw-hubback" type="button" aria-label="허브로 가기" title="허브로">` +
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/>` +
    `<rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/></svg></button>` +
    `<div class="rw-body" id="rw-body"></div>` +
    `<nav class="rw-nav">` +
    `<button data-v="home"><span class="ni">🏠</span>홈</button>` +
    `<button data-v="league"><span class="ni">🏆</span>리그</button>` +
    `<button data-v="ad"><span class="ni">📺</span>광고</button>` +
    `<button data-v="cash"><span class="ni">💱</span>교환소</button>` +
    `<button data-v="more"><span class="ni">☰</span>더보기</button>` +
    `</nav>`;
  document.body.appendChild(layer);
  const body = layer.querySelector<HTMLElement>('#rw-body')!;

  // 셸이 열려 있는 동안 뒤 허브 페이지 스크롤을 잠근다 — 안 그러면 뒤 페이지 스크롤바 + 셸(.rw-body)
  //   스크롤바가 동시에 생겨 스크롤바가 2개로 보인다. 닫을 때 원복.
  const prevHtmlOv = document.documentElement.style.overflow;
  const prevBodyOv = document.body.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  const close = (): void => {
    layer.remove();
    document.documentElement.style.overflow = prevHtmlOv;
    document.body.style.overflow = prevBodyOv;
    onClose?.();
  };
  // 상단 우측 '허브로 가기' — 셸을 닫아 뒤의 허브 화면으로 돌아간다(모든 탭 공통).
  layer.querySelector('.rw-hubback')!.addEventListener('click', close);

  /** 다이아 지급(💎) — 모든 보상의 1차 도착지. 캐시(원)는 교환소 전환으로만 생긴다. */
  const grantDia = (amount: number): void => {
    if (amount <= 0) return;
    setNum(DIA_KEY, num(DIA_KEY) + amount);
    addTodayDia(amount);
    onClose?.(); // 허브 지갑바도 갱신(같은 출처)
  };
  /** 미션 완료 — 다이아 + 리그 P 병행 지급(시간대 보너스는 P만, P가 쌓이면 자동 시즌 참여). */
  const complete = (id: string, amount: number, label = '적립', pts = 0): void => {
    const d = doneSet();
    if (!d.has(id)) {
      d.add(id);
      saveDone(d);
    }
    grantDia(amount);
    let ptxt = '';
    if (pts > 0) {
      const t = Date.now();
      const boosted = withSlotBonus(pts, t);
      addPts(boosted, t);
      ptxt = ` · 리그 P+${boosted}`;
    }
    toast(`🎁 ${label} · +${dia(amount)}${ptxt}`);
  };

  const setNav = (v: View): void =>
    layer.querySelectorAll<HTMLButtonElement>('.rw-nav button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));

  const render = (v: View): void => {
    setNav(v);
    body.scrollTop = 0;
    if (v === 'home') renderHome(body, render, complete);
    else if (v === 'league') renderLeague(body, { rerender: () => render('league') });
    else if (v === 'ad') renderAd(body, grantDia);
    else if (v === 'cash') renderCash(body, () => render('cash'));
    else if (v === 'friends') renderFriends(body, complete);
    else renderMore(body, close, render);
  };

  layer.querySelectorAll<HTMLButtonElement>('.rw-nav button').forEach((b) =>
    b.addEventListener('click', () => render(b.dataset.v as View)),
  );

  // 시즌 롤오버 정산 — 지난 시즌 순위 보상을 다이아로 즉시 지급 + 결과 모달(주 1회, mock).
  const settled = settleIfNeeded(Date.now());
  if (settled) {
    grantDia(settled.dia);
    showSeasonModal(layer, settled);
  }

  // 게임 미션 복귀 판정 — 게임 실행이 '같은 창 이동'이라 종료 콜백이 없다. 실행 직전 남긴
  //   pending 마커를 다음 셸 오픈 때 회수해, 최소 플레이 시간을 넘겼으면 보상 지급(mock).
  try {
    const rawPending = localStorage.getItem(PENDING_KEY);
    if (rawPending) {
      localStorage.removeItem(PENDING_KEY);
      const p = JSON.parse(rawPending) as { id?: string; at?: number };
      const m = MISSIONS.find((x) => x.id === p.id);
      if (m && !doneSet().has(m.id)) {
        if (Date.now() - (Number(p.at) || 0) >= GAME_MIN_PLAY_MS) {
          complete(m.id, m.reward, m.title, m.pts);
        } else {
          toast('게임을 조금 더 플레이하면 미션 보상을 받을 수 있어요 🎮');
        }
      }
    }
  } catch {
    /* 판정 실패는 무시(mock) */
  }
  render('home');
}

/** 시즌 종료 결과 모달 — 보상(💎)은 이미 지급된 상태(정보 표시 + 새 시즌 안내). */
function showSeasonModal(layer: HTMLElement, res: SeasonResult): void {
  const wrap = document.createElement('div');
  wrap.className = 'rw-modal';
  wrap.innerHTML =
    `<div class="bx">` +
    `<div class="big">🏁</div>` +
    `<b class="tt">시즌 종료!</b>` +
    `<div class="row">지난 시즌 <b>${res.rank}위</b> · ${res.pts.toLocaleString()}P</div>` +
    `<div class="cash">+${res.dia.toLocaleString()}💎 지급 완료</div>` +
    `<p>받은 다이아는 교환소에서 캐시로 바꿀 수 있어요.<br/>P는 랭킹 전용 — 새 시즌과 함께 0부터 다시!</p>` +
    `<button class="rw-cta" data-ok style="margin:10px 0 0">확인</button>` +
    `</div>`;
  wrap.querySelector('[data-ok]')!.addEventListener('click', () => wrap.remove());
  layer.appendChild(wrap);
}

/** 완료 미션의 '광고 보고 P 2배' 수령 — 광고를 끝까지 본 뒤에만 지급(미션당 1회). */
function claimDouble(m: Mission, rerender: () => void): void {
  const d = doubledSet();
  if (m.pts <= 0 || d.has(m.id)) return;
  playAd(() => {
    saveDoubled(new Set([...doubledSet(), m.id]));
    const t = Date.now();
    const bonus = withSlotBonus(m.pts, t);
    addPts(bonus, t);
    toast(`📺 광고 시청 · ${m.title} P 2배 +${bonus}P`);
    rerender();
  });
}

/** 행운 룰렛 — 스핀 연출 후 결과 확정(확인을 눌러야 지급 콜백). */
function spinRoulette(onDone: (prize: number) => void): void {
  const layer = document.querySelector<HTMLElement>('.rw-layer');
  if (!layer) return;
  const wrap = document.createElement('div');
  wrap.className = 'rw-modal';
  wrap.innerHTML =
    `<div class="bx"><div class="big"><span class="wheel">🎡</span></div>` +
    `<b class="tt">행운 룰렛</b><div class="row">두구두구...</div></div>`;
  layer.appendChild(wrap);
  const prize = ROULETTE_PRIZES[Math.floor(Math.random() * ROULETTE_PRIZES.length)];
  window.setTimeout(() => {
    const bx = wrap.querySelector<HTMLElement>('.bx')!;
    bx.innerHTML =
      `<div class="big">${prize > 0 ? '🎉' : '😢'}</div>` +
      `<b class="tt">${prize > 0 ? `+${prize.toLocaleString()}💎 당첨!` : '아쉽게 꽝!'}</b>` +
      `<p>${prize > 0 ? '다이아가 바로 적립돼요' : '참여 리그 P는 지급돼요 — 내일 다시 도전!'}</p>` +
      `<button class="rw-cta" data-ok style="margin:10px 0 0">확인</button>`;
    bx.querySelector('[data-ok]')!.addEventListener('click', () => {
      wrap.remove();
      onDone(prize);
    });
  }, 1800);
}

/** 친구 초대 — 공유(또는 링크 복사)가 실제로 이뤄진 뒤에만 지급(일 1회). */
function runInvite(m: Mission, complete: CompleteFn, rerender: () => void): void {
  if (doneSet().has(m.id)) {
    toast('오늘은 이미 초대 보상을 받았어요');
    return;
  }
  const link = `${location.origin}${location.pathname}?ref=${encodeURIComponent(loadIdentity().id || 'me')}`;
  const finish = (): void => {
    complete(m.id, m.reward, m.title, m.pts);
    rerender();
  };
  const nav = navigator as Navigator & { share?: (d: { title: string; text: string; url: string }) => Promise<void> };
  if (typeof nav.share === 'function') {
    nav
      .share({ title: 'CashPOP', text: '같이 리워드 모으자! 내 초대 링크야 🎁', url: link })
      .then(finish)
      .catch(() => toast('공유가 취소되었어요'));
    return;
  }
  navigator.clipboard
    ?.writeText(link)
    .then(() => {
      toast('초대 링크를 복사했어요 · 친구에게 공유하세요');
      finish();
    })
    .catch(() => toast('링크 복사에 실패했어요 — 다시 시도해 주세요'));
}

/* ─────────── 홈 ─────────── */
function renderHome(body: HTMLElement, go: (v: View) => void, complete: CompleteFn): void {
  const diamonds = num(DIA_KEY);
  const cash = num(CASH_KEY);
  const today = todayDia();
  const pct = Math.min(100, Math.round((today / GOAL_DIA) * 100));
  const id = loadIdentity().id;
  const done = doneSet();
  const doubled = doubledSet();
  const bonus = slotBonus(Date.now());

  const missionRow = (m: Mission, i: number): string => {
    const isDone = done.has(m.id);
    // 완료 후에도 P 미션은 '광고 보고 2배' 1회가 남는다(출석 체크인 ×2 구조 이식).
    const canDouble = isDone && m.pts > 0 && !doubled.has(m.id);
    const reward = m.reward > 0 ? `+${dia(m.reward)}` : m.rewardText || '';
    const btn = !isDone ? `${esc(m.cta)}<em>${reward}</em>` : canDouble ? '📺 P 2배' : '완료';
    return (
      `<div class="rw-mission${isDone && !canDouble ? ' done' : ''}" data-id="${esc(m.id)}">` +
      `<span class="no">${isDone ? '✓' : i + 1}</span>` +
      `<span class="ic">${m.icon}</span>` +
      `<span class="tx"><b>${esc(m.title)}</b><span>${esc(m.desc)}</span></span>` +
      `<button class="rw-mbtn${canDouble ? ' dbl' : ''}" data-act${isDone && !canDouble ? ' disabled' : ''}>${btn}</button>` +
      `</div>`
    );
  };

  body.innerHTML =
    `<div class="rw-top"><img class="rw-logo" src="art/CashPOP_logo_t.webp" alt="CashPOP" /></div>` +
    `<div class="rw-hello">안녕하세요, <b>${esc(id)}</b>님! 👋</div>` +
    `<p class="rw-hello2">광고 보고 다이아 모아 현금으로 바꿔가세요!</p>` +
    // 다이아 카드(환전 재화) — 캐시(원)는 교환소 전환으로만
    `<div class="rw-cash dia">` +
    `<div class="rw-cash-top"><span>내 다이아 💎 ⓘ</span><button class="wd" data-go="cash">교환하기 ›</button></div>` +
    `<div class="rw-cash-amt">${diamonds.toLocaleString()}<small>💎</small></div>` +
    `<div class="rw-cash-foot"><span>💵 캐시 ${won(cash)} · 출금 대기</span><span>💱 ${EXCHANGE_MIN_DIA.toLocaleString()}💎부터 전환</span></div>` +
    `</div>` +
    // 오늘의 적립 현황
    `<div class="rw-panel">` +
    `<div class="rw-panel-h"><b>오늘의 적립 현황</b><span>📅</span></div>` +
    `<div class="rw-earn">` +
    `<div class="rw-earn-col"><span class="ic">💎</span><div><small>오늘 적립</small><b>${today.toLocaleString()}</b></div></div>` +
    `<div class="rw-earn-col"><span class="ic">🎯</span><div><small>목표 달성률</small><b>${pct}%</b></div></div>` +
    `</div>` +
    `<div class="rw-bar"><i style="width:${pct}%"></i></div>` +
    `<div class="rw-goal">목표 ${dia(GOAL_DIA)}</div>` +
    `</div>` +
    // 리그 카드 — 순위 경쟁 진입점(광고를 더 보게 만드는 구조의 전면 노출)
    leagueHomeCard(Date.now()) +
    // 광고 배너
    `<button class="rw-adbn" data-ad>` +
    `<span class="pl">▶</span><span class="tx"><b>광고 보고 적립하기</b><span>광고 시청하고 다이아 받기</span></span>` +
    `<span class="rw-pill">+500~2,000💎</span></button>` +
    // 오늘의 미션(순서대로) — 보너스 시간대엔 P 배수 안내로 교체
    `<div class="rw-h2"><span>오늘의 미션</span><small>${
      bonus ? `${bonus.icon} ${bonus.name} 보너스 — P ×${bonus.mult} (${bonus.until}까지)` : '순서대로 완료하고 캐시를 모으세요'
    }</small></div>` +
    MISSIONS.map(missionRow).join('') +
    // 이벤트 배너
    `<div class="rw-event"><div class="tx"><small>기간 한정 이벤트 🎉</small><b>더 많이 보고, 더 많이 받자!</b>` +
    `<span>지금 참여하면 추가 캐시 지급!</span></div><button class="go" data-ad>›</button></div>`;

  // 캐시 카드 출금 → 내 캐시 탭
  body.querySelectorAll<HTMLElement>('[data-go="cash"]').forEach((b) => b.addEventListener('click', () => go('cash')));
  // 리그 카드 → 리그 탭
  body.querySelectorAll<HTMLElement>('[data-go-league]').forEach((b) => b.addEventListener('click', () => go('league')));
  // 광고 배너 → 광고 탭
  body.querySelectorAll<HTMLElement>('[data-ad]').forEach((b) => b.addEventListener('click', () => go('ad')));

  // 미션 실행(미완료=수행 / 완료+P미션=광고 보고 2배 1회)
  body.querySelectorAll<HTMLElement>('.rw-mission').forEach((row) => {
    const m = MISSIONS.find((x) => x.id === row.dataset.id)!;
    row.querySelector<HTMLButtonElement>('[data-act]')?.addEventListener('click', () => {
      const rerender = (): void => renderHome(body, go, complete);
      if (doneSet().has(m.id)) claimDouble(m, rerender);
      else runMission(m, complete, rerender);
    });
  });
}

/**
 * 미션 종류별 실행 — 종류마다 '실제 진행 게이트'를 통과해야 지급된다:
 *   ad=광고 끝까지 시청 / roulette=스핀 후 결과 / invite=공유·복사 실행 /
 *   game=복귀 판정(최소 플레이 시간) / attend=오늘 접속(일 1회, 자정 리셋).
 * 게임은 **기존 launchGame 그대로**(변경 금지).
 */
function runMission(m: Mission, complete: CompleteFn, rerender: () => void): void {
  if (m.kind === 'game') {
    const game = (GAMES as GameEntry[]).find((g) => g.id === m.gameId);
    if (!game) return;
    if (!isPlayable(game.id)) {
      toast('곧 오픈 예정입니다 🚧');
      return;
    }
    // 그리드 카드와 동일한 실행 경로(변경 금지). 같은 창 이동이라 종료 콜백이 안 돌므로,
    //   실행 마커를 남겨 다음 셸 오픈 때 복귀 판정(최소 플레이 시간)으로 지급한다.
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ id: m.id, at: Date.now() }));
    } catch {
      /* 무시 */
    }
    launchGame(game, () => {
      // 팝업 환경(구버전 런처)에서만 발동하는 기존 경로 — 유지.
      try {
        localStorage.removeItem(PENDING_KEY);
      } catch {
        /* 무시 */
      }
      complete(m.id, m.reward, m.title, m.pts);
      rerender();
    });
    return;
  }
  if (m.kind === 'ad') {
    // 시청 게이트 — 모의 광고를 끝까지 본 뒤에만 지급.
    playAd(() => {
      complete(m.id, m.reward, m.title, m.pts);
      rerender();
    });
    return;
  }
  if (m.kind === 'roulette') {
    spinRoulette((prize) => {
      if (prize > 0) {
        complete(m.id, prize, '행운 룰렛', m.pts);
      } else {
        // 꽝 — 캐시는 없지만 참여 P는 지급하고 오늘 미션은 소진 처리.
        const d = doneSet();
        d.add(m.id);
        saveDone(d);
        const t = Date.now();
        const bonus = withSlotBonus(m.pts, t);
        addPts(bonus, t);
        toast(`아쉽게 꽝! 참여 리그 P+${bonus}`);
      }
      rerender();
    });
    return;
  }
  if (m.kind === 'invite') {
    runInvite(m, complete, rerender);
    return;
  }
  if (m.kind === 'coupon') {
    toast('쿠폰함은 곧 열려요 🎟️');
    return;
  }
  // attend — 오늘 접속 자체가 완료 조건(일 1회, 자정 리셋).
  complete(m.id, m.reward, m.title, m.pts);
  rerender();
}

/* ─────────── 광고 탭 ─────────── */
function renderAd(body: HTMLElement, grantDia: (n: number) => void): void {
  const offers = [
    { id: 'ad-video', icon: '📺', label: '영상 광고 시청', sub: '30초 광고 보고 적립', min: 500, max: 2000 },
    { id: 'ad-offer', icon: '🎁', label: '오퍼월 참여', sub: '앱 설치·미션 완료', min: 1000, max: 5000 },
    { id: 'ad-daily', icon: '☀️', label: '출석 리워드 광고', sub: '하루 1회 보너스', min: 800, max: 1500 },
  ];
  body.innerHTML =
    `<div class="rw-h2"><span>📺 광고 보고 적립</span></div>` +
    `<p class="rw-note">광고를 보면 다이아(환전용)와 리그 P(랭킹용)·주사위가 함께 쌓여요.</p>` +
    offers
      .map(
        (o) =>
          `<div class="rw-lr" data-id="${o.id}" data-min="${o.min}" data-max="${o.max}">` +
          `<span><b>${o.icon} ${esc(o.label)}</b><small>${esc(o.sub)} · 🏆 P+${AD_PTS} 🎲+${AD_DICE}</small></span>` +
          `<button class="rw-mbtn">시청 <em>+${o.min.toLocaleString()}~${o.max.toLocaleString()}💎</em></button></div>`,
      )
      .join('');
  body.querySelectorAll<HTMLElement>('.rw-lr').forEach((row) => {
    const min = Number(row.dataset.min),
      max = Number(row.dataset.max);
    row.querySelector<HTMLButtonElement>('.rw-mbtn')!.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      if (btn.disabled) return;
      // 시청 게이트 — 광고를 끝까지 본 뒤에만 지급.
      playAd(() => {
        const prize = min + Math.floor(Math.random() * (max - min + 1));
        grantDia(prize);
        const t = Date.now();
        const gained = withSlotBonus(AD_PTS, t); // 광고 = 리그 P 2배 가중 재화(+시간대 보너스)
        addPts(gained, t);
        addDice(AD_DICE, t);
        toast(`🎁 광고 시청 완료 · +${dia(prize)} · P+${gained} · 🎲+${AD_DICE}`);
        btn.textContent = '완료';
        btn.disabled = true;
      });
    });
  });
}

/* ─────────── 교환소 탭 — 💎 → 원 전환(허들) + 출금 ─────────── */
function renderCash(body: HTMLElement, rerender: () => void): void {
  const diamonds = num(DIA_KEY);
  const cash = num(CASH_KEY);
  // 전환 가능액 — 최소 허들을 넘겼을 때만, 단위로 끊어서(잔량은 남아 다음 목표가 된다).
  const usable = diamonds >= EXCHANGE_MIN_DIA ? Math.floor(diamonds / EXCHANGE_UNIT_DIA) * EXCHANGE_UNIT_DIA : 0;
  const usableWon = usable / DIA_PER_WON;
  const lack = Math.max(0, EXCHANGE_MIN_DIA - diamonds);
  const pct = Math.min(100, Math.round((diamonds / EXCHANGE_MIN_DIA) * 100));
  const canWithdraw = cash >= WITHDRAW_MIN;
  body.innerHTML =
    // 다이아(환전 재화) 카드
    `<div class="rw-cash dia" style="margin-top:6px">` +
    `<div class="rw-cash-top"><span>내 다이아 💎</span></div>` +
    `<div class="rw-cash-amt">${diamonds.toLocaleString()}<small>💎</small></div>` +
    `<div class="rw-cash-foot"><span>오늘 +${todayDia().toLocaleString()}💎</span><span>💱 ${EXCHANGE_UNIT_DIA.toLocaleString()}💎 단위 전환</span></div>` +
    `</div>` +
    // 전환 패널(허들 진행바)
    `<div class="rw-panel">` +
    `<div class="rw-panel-h"><b>💱 캐시 전환</b><small style="color:#8A94A6">${EXCHANGE_MIN_DIA.toLocaleString()}💎 = ${(EXCHANGE_MIN_DIA / DIA_PER_WON).toLocaleString()}원</small></div>` +
    `<div class="rw-goal" style="text-align:left;margin-bottom:8px">환율 ${DIA_PER_WON}💎 = 1원 · 최소 ${EXCHANGE_MIN_DIA.toLocaleString()}💎부터 전환 가능</div>` +
    `<div class="rw-bar"><i style="width:${pct}%"></i></div>` +
    `<div class="rw-goal">${diamonds.toLocaleString()} / ${EXCHANGE_MIN_DIA.toLocaleString()}💎</div>` +
    `<button class="rw-cta" id="rw-ex" style="margin-top:10px"${usable > 0 ? '' : ' disabled'}>` +
    (usable > 0 ? `${usable.toLocaleString()}💎 → ${usableWon.toLocaleString()}원 전환하기` : `${lack.toLocaleString()}💎 더 모으면 전환 가능`) +
    `</button>` +
    `</div>` +
    // 캐시(원) 카드 + 출금
    `<div class="rw-cash">` +
    `<div class="rw-cash-top"><span>사용 가능한 캐시</span></div>` +
    `<div class="rw-cash-amt">${cash.toLocaleString()}<small>원</small></div>` +
    `<div class="rw-cash-foot"><span>💳 ${WITHDRAW_MIN}원부터 출금 가능</span><span>🛡️ 안전하고 빠른 지급</span></div>` +
    `</div>` +
    `<button class="rw-cta" id="rw-wd"${canWithdraw ? '' : ' disabled'}>${canWithdraw ? `${cash.toLocaleString()}원 출금하기` : `출금은 ${WITHDRAW_MIN}원부터 가능해요`}</button>` +
    `<p class="rw-note">※ 미션·광고 보상은 모두 다이아로 지급되며, 캐시는 전환으로만 생깁니다.<br/>실제 출금(페이머니·계좌 이체)은 백엔드 연동(Phase B) 이후 활성화됩니다.</p>`;
  // 전환 — 다이아 차감 + 캐시 가산(원)
  body.querySelector<HTMLButtonElement>('#rw-ex')?.addEventListener('click', () => {
    const d = num(DIA_KEY);
    if (d < EXCHANGE_MIN_DIA) return;
    const use = Math.floor(d / EXCHANGE_UNIT_DIA) * EXCHANGE_UNIT_DIA;
    setNum(DIA_KEY, d - use);
    setNum(CASH_KEY, num(CASH_KEY) + use / DIA_PER_WON);
    toast(`💱 전환 완료 · ${use.toLocaleString()}💎 → ${(use / DIA_PER_WON).toLocaleString()}원`);
    rerender();
  });
  const wd = body.querySelector<HTMLButtonElement>('#rw-wd');
  wd?.addEventListener('click', () => {
    if (num(CASH_KEY) < WITHDRAW_MIN) return;
    toast('출금 신청이 접수되었어요 (데모)');
    setNum(CASH_KEY, 0);
    rerender();
  });
}

/* ─────────── 친구(더보기에서 진입 — 하단 탭 자리는 리그에 양보) ─────────── */
function renderFriends(body: HTMLElement, complete: CompleteFn): void {
  const invite = MISSIONS.find((m) => m.id === 'invite')!;
  const code = 'CASHPOP-' + (loadIdentity().id || 'USER').toUpperCase().slice(0, 6);
  body.innerHTML =
    `<div class="rw-h2"><span>👥 친구 초대</span></div>` +
    `<div class="rw-panel"><div class="rw-panel-h"><b>내 초대 코드</b></div>` +
    `<div style="font-size:22px;color:#2E6BFF;text-align:center;letter-spacing:1px">${esc(code)}</div>` +
    `<p class="rw-note" style="margin-bottom:0">친구가 가입하면 나도 친구도 <b>+5,000💎</b></p></div>` +
    `<button class="rw-cta" id="rw-inv">친구 초대하고 +5,000💎 받기</button>` +
    `<p class="rw-note">※ 공유·복사가 실행된 뒤 지급됩니다. 실제 초대 추적은 백엔드(Phase B) 연동 시 활성화됩니다.</p>`;
  body.querySelector<HTMLButtonElement>('#rw-inv')!.addEventListener('click', () => {
    runInvite(invite, complete, () => renderFriends(body, complete));
  });
}

/* ─────────── 더보기 탭 ─────────── */
function renderMore(body: HTMLElement, closeShell: () => void, go: (v: View) => void): void {
  const menu = ['🎁 선물함', '📋 적립 내역', '🎟️ 쿠폰함', '📢 공지사항', '💬 고객센터', '⚙️ 설정'];
  body.innerHTML =
    `<div class="rw-h2"><span>⚙️ 더보기</span></div>` +
    `<div class="rw-lr"><span><b>🙋 ${esc(loadIdentity().id)} 님</b><small>CashPOP 리워드 회원</small></span></div>` +
    `<div class="rw-lr" id="rw-go-friends" style="cursor:pointer"><span><b>👥 친구 초대</b><small>나도 친구도 +5,000💎</small></span><span aria-hidden="true">›</span></div>` +
    menu.map((m) => `<div class="rw-lr"><span><b>${esc(m)}</b></span><span aria-hidden="true">›</span></div>`).join('') +
    `<button class="rw-cta" id="rw-back" style="background:#fff;color:#2E6BFF;box-shadow:none;border:1px solid #E7EBF2">허브로 돌아가기</button>` +
    `<p class="rw-note">프로필·선물함·내역은 백엔드(Phase B) 연동 시 실데이터로 채워집니다.</p>`;
  body.querySelector<HTMLElement>('#rw-go-friends')!.addEventListener('click', () => go('friends'));
  body.querySelector<HTMLButtonElement>('#rw-back')!.addEventListener('click', closeShell);
}
