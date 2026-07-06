/**
 * reward/leagueView — CashPOP 리그 탭 화면.
 *
 * 구성(위→아래): 시즌 헤더(내 P·순위·예상 보상) → 주사위 부스터(굴리기)
 *   → 광고 루프 버튼(🎲+P 지급 — 핵심 재화 파이프) → 실시간 랭킹(TOP10+내 주변)
 *   → 시즌 보상표(내 구간 하이라이트) → 주사위 충전 패키지(mock 인앱).
 * 로직/상태는 league.ts, 셸 배선은 shell.ts.
 */
import { toast } from '../account.js';
import { AD_DICE, AD_PTS, DICE_PACKS, LEAGUE_JOIN_CASH, LEAGUE_TIERS, ROLL_MULT, ROLL_JACKPOT } from './data.js';
import {
  addDice,
  addPts,
  computeBoard,
  loadLeague,
  rewardFor,
  rollDice,
  seasonDday,
  seasonLabel,
  slotBonus,
  tierFor,
  withSlotBonus,
} from './league.js';

/** 셸 의존 주입 — 캐시 지급과 재렌더만 필요. */
export interface LeagueCtx {
  rerender: () => void;
}

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const;

/** 마지막 굴리기 결과(재렌더 후에도 표시 유지 — 세션 한정). */
let lastRoll: { face: number; gained: number; jackpot: boolean } | null = null;

/** 리그 전용 스타일 1회 주입(.rw-lg-*). */
export function injectLeagueStyles(): void {
  if (document.getElementById('rw-lg-styles')) return;
  const s = document.createElement('style');
  s.id = 'rw-lg-styles';
  s.textContent = `
    .rw-lg-hero{border-radius:22px;padding:20px;color:#fff;margin-bottom:16px;
      background:linear-gradient(135deg,#7C5CFF,#4A6CFF);box-shadow:0 14px 30px rgba(92,92,255,.32)}
    .rw-lg-hero .tt{display:flex;align-items:center;justify-content:space-between;font-size:15px}
    .rw-lg-hero .tt .dday{background:rgba(255,255,255,.2);border-radius:999px;padding:5px 12px;font-size:13px}
    .rw-lg-hero .period{font-size:12.5px;opacity:.8;margin-top:3px}
    .rw-lg-stats{display:flex;gap:10px;background:rgba(255,255,255,.14);border-radius:14px;padding:12px 8px;margin-top:14px}
    .rw-lg-stats>div{flex:1;text-align:center}
    .rw-lg-stats>div+div{border-left:1px solid rgba(255,255,255,.25)}
    .rw-lg-stats small{display:block;font-size:11.5px;opacity:.8;margin-bottom:3px}
    .rw-lg-stats b{font-size:19px;font-weight:800}
    .rw-lg-slot{margin-top:10px;background:rgba(255,210,74,.28);border-radius:10px;padding:7px 11px;font-size:12.5px}
    /* 주사위 부스터 */
    .rw-lg-dice{display:flex;align-items:center;gap:14px}
    .rw-lg-dice .cube{width:58px;height:58px;border-radius:16px;background:#F2EEFF;display:flex;align-items:center;justify-content:center;font-size:34px;flex:none}
    .rw-lg-dice .tx{flex:1;min-width:0}
    .rw-lg-dice .tx b{display:block;font-size:16px;color:#1B2438}
    .rw-lg-dice .tx span{display:block;font-size:12.5px;color:#8A94A6;margin-top:2px}
    .rw-lg-roll{flex:none;font-family:inherit;cursor:pointer;border:0;border-radius:14px;padding:12px 16px;font-size:15px;
      color:#fff;background:linear-gradient(135deg,#7C5CFF,#4A6CFF);box-shadow:0 8px 18px rgba(92,92,255,.3)}
    .rw-lg-roll:disabled{background:#C7CDD8;box-shadow:none;cursor:default}
    .rw-lg-last{margin-top:12px;border-top:1px dashed #EDF0F5;padding-top:11px;display:flex;align-items:center;gap:10px;font-size:14px;color:#1B2438}
    .rw-lg-last .fc{font-size:26px}
    .rw-lg-last b{color:#7C5CFF}
    .rw-lg-last .jp{background:#FFF1D6;color:#B4770A;border-radius:999px;font-size:11.5px;padding:3px 9px}
    /* 랭킹 */
    .rw-lg-row{display:flex;align-items:center;gap:11px;background:#fff;border-radius:14px;padding:11px 14px;margin-bottom:7px;box-shadow:0 5px 14px rgba(20,30,60,.05)}
    .rw-lg-row .rk{flex:none;width:30px;text-align:center;font-size:14px;color:#8A94A6}
    .rw-lg-row .rk.m{font-size:18px}
    .rw-lg-row .nm{flex:1;min-width:0;font-size:14.5px;color:#1B2438;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rw-lg-row .pt{flex:none;font-size:14px;color:#2E6BFF;font-weight:800}
    .rw-lg-row .pt small{font-weight:400;color:#8A94A6;margin-left:2px}
    .rw-lg-row.me{background:linear-gradient(135deg,#EEF3FF,#F4F0FF);border:1.5px solid #7C5CFF}
    .rw-lg-row.me .nm{color:#4A3ACF;font-weight:800}
    .rw-lg-gap{text-align:center;color:#C0C7D4;font-size:13px;margin:2px 0 8px;letter-spacing:3px}
    /* 보상표 */
    .rw-lg-tier{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-radius:12px;margin-bottom:6px;background:#F7F9FC;font-size:14px;color:#1B2438}
    .rw-lg-tier .rg{color:#8A94A6}
    .rw-lg-tier b{color:#2E6BFF}
    .rw-lg-tier.cur{background:#F1EDFF;border:1.5px solid #7C5CFF}
    .rw-lg-tier.cur .rg{color:#4A3ACF;font-weight:800}
    /* 주사위 패키지 */
    .rw-lg-packs{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .rw-lg-pack{position:relative;background:#fff;border:1px solid #EDF0F5;border-radius:16px;padding:14px;text-align:center;box-shadow:0 5px 14px rgba(20,30,60,.05)}
    .rw-lg-pack .em{font-size:26px}
    .rw-lg-pack b{display:block;font-size:15px;color:#1B2438;margin-top:4px}
    .rw-lg-pack small{display:block;color:#28a745;font-size:12px;margin-top:2px;min-height:15px}
    .rw-lg-pack .buy{margin-top:9px;width:100%;font-family:inherit;cursor:pointer;border:0;border-radius:11px;padding:9px 0;font-size:13.5px;background:#FFD24A;color:#5a3a06}
    .rw-lg-pack .tag{position:absolute;top:-8px;right:10px;background:#FF5A7E;color:#fff;font-size:10.5px;border-radius:999px;padding:3px 8px}
  `;
  document.head.appendChild(s);
}

/** 홈 상단에 꽂는 리그 요약 카드 — 클릭 배선(data-go-league)은 셸에서. */
export function leagueHomeCard(now: number): string {
  const st = loadLeague(now);
  const joined = st.pts > 0;
  const { myRank, total } = computeBoard(st.pts, now);
  const est = rewardFor(myRank, st.pts);
  const mid =
    joined
      ? `<div class="rw-earn-col"><span class="ic">🏅</span><div><small>현재 순위</small><b>${myRank}위<span style="font-size:13px;color:#8A94A6"> / ${total}</span></b></div></div>` +
        `<div class="rw-earn-col"><span class="ic">💰</span><div><small>시즌 종료 예상</small><b>+${est.toLocaleString()}원</b></div></div>`
      : `<div class="rw-earn-col"><span class="ic">🏅</span><div><small>참여 상태</small><b style="font-size:16px">미참여</b></div></div>` +
        `<div class="rw-earn-col"><span class="ic">💰</span><div><small>참여만 해도</small><b>+${LEAGUE_JOIN_CASH}원</b></div></div>`;
  return (
    `<div class="rw-panel" data-go-league style="cursor:pointer">` +
    `<div class="rw-panel-h"><b>🏆 주간 리그 · 순위 경쟁</b><span style="color:#7C5CFF;font-size:13px">D-${seasonDday(now)} ›</span></div>` +
    `<div class="rw-earn">${mid}</div>` +
    `<div class="rw-goal" style="text-align:left;margin-top:10px">광고를 볼수록 P가 쌓이고, 순위가 오를수록 보상이 커져요</div>` +
    `</div>`
  );
}

/** 리그 탭 렌더. */
export function renderLeague(body: HTMLElement, ctx: LeagueCtx): void {
  injectLeagueStyles();
  const now = Date.now();
  const st = loadLeague(now);
  const joined = st.pts > 0;
  const board = computeBoard(st.pts, now);
  const est = rewardFor(board.myRank, st.pts);
  const myTier = tierFor(board.myRank);
  const bonus = slotBonus(now);

  const rankRow = (r: { rank: number; name: string; pts: number; isMe: boolean }): string => {
    const medal = r.rank === 1 ? '👑' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : '';
    return (
      `<div class="rw-lg-row${r.isMe ? ' me' : ''}">` +
      `<span class="rk${medal ? ' m' : ''}">${medal || r.rank}</span>` +
      `<span class="nm">${r.isMe ? '나 ⭐' : r.name}</span>` +
      `<span class="pt">${r.pts.toLocaleString()}<small>P</small></span>` +
      `</div>`
    );
  };
  const top = board.rows.slice(0, Math.min(10, board.rows.length));
  const near = board.rows.slice(top.length);

  const tierRow = (t: { from: number; to: number; cash: number }): string => {
    const cur = joined && myTier === t;
    const range = t.from === t.to ? `${t.from}위` : `${t.from} ~ ${t.to}위`;
    return (
      `<div class="rw-lg-tier${cur ? ' cur' : ''}"><span class="rg">${range}${cur ? ' · 내 구간' : ''}</span>` +
      `<b>+${t.cash.toLocaleString()}원</b></div>`
    );
  };

  const packCard = (p: { n: number; bonus: number; priceWon: number; tag?: string }, i: number): string =>
    `<div class="rw-lg-pack">` +
    (p.tag ? `<span class="tag">${p.tag}</span>` : '') +
    `<span class="em">${i === DICE_PACKS.length - 1 ? '💎' : '🎲'}</span>` +
    `<b>주사위 ${p.n}개</b>` +
    `<small>${p.bonus > 0 ? `보너스 +${p.bonus}개!` : ''}</small>` +
    `<button class="buy" data-pack="${i}">₩${p.priceWon.toLocaleString()}</button>` +
    `</div>`;

  body.innerHTML =
    // 시즌 헤더
    `<div class="rw-lg-hero">` +
    `<div class="tt"><span>🏆 주간 리그 시즌</span><span class="dday">D-${seasonDday(now)}</span></div>` +
    `<div class="period">${seasonLabel(now)} · 일요일 23:59 종료 후 순위별 캐시 지급</div>` +
    `<div class="rw-lg-stats">` +
    `<div><small>내 포인트</small><b>${st.pts.toLocaleString()}P</b></div>` +
    `<div><small>현재 순위</small><b>${joined ? `${board.myRank}위` : '미참여'}</b></div>` +
    `<div><small>종료 시 예상</small><b>+${est.toLocaleString()}원</b></div>` +
    `</div>` +
    (bonus
      ? `<div class="rw-lg-slot">${bonus.icon} 지금은 <b>${bonus.name} 보너스</b> — 모든 P 적립 ×${bonus.mult} (${bonus.until}까지)</div>`
      : '') +
    `</div>` +
    // 주사위 부스터
    `<div class="rw-panel"><div class="rw-panel-h"><b>🎲 주사위 부스터</b><small style="color:#8A94A6">1개당 P ${ROLL_MULT}~${6 * ROLL_MULT + ROLL_JACKPOT} 획득</small></div>` +
    `<div class="rw-lg-dice">` +
    `<span class="cube">🎲</span>` +
    `<span class="tx"><b>보유 ${st.dice}개</b><span>굴린 눈 × ${ROLL_MULT}P · ⚅ 6이 나오면 잭팟 +${ROLL_JACKPOT}P</span></span>` +
    `<button class="rw-lg-roll" data-roll${st.dice <= 0 ? ' disabled' : ''}>${st.dice <= 0 ? '주사위 없음' : '굴리기 -1'}</button>` +
    `</div>` +
    (lastRoll
      ? `<div class="rw-lg-last"><span class="fc">${DICE_FACES[lastRoll.face - 1]}</span>` +
        `<span>${lastRoll.face} 이 나와 <b>+${lastRoll.gained.toLocaleString()}P</b> 획득!</span>` +
        (lastRoll.jackpot ? `<span class="jp">🎉 잭팟</span>` : '') +
        `</div>`
      : '') +
    `</div>` +
    // 광고 루프(핵심 파이프)
    `<button class="rw-adbn" data-lg-ad>` +
    `<span class="pl">▶</span><span class="tx"><b>광고 보고 부스터 받기</b><span>시청 1회 = 🎲 주사위 +${AD_DICE} & P +${AD_PTS}</span></span>` +
    `<span class="rw-pill">🎲+${AD_DICE} · P+${AD_PTS}</span></button>` +
    // 랭킹
    `<div class="rw-h2"><span>실시간 랭킹</span><small>총 ${board.total}명 경쟁 중</small></div>` +
    top.map(rankRow).join('') +
    (near.length ? `<div class="rw-lg-gap">⋯</div>` + near.map(rankRow).join('') : '') +
    // 보상표
    `<div class="rw-h2" style="margin-top:16px"><span>시즌 보상표</span><small>순위 확정 후 자동 지급</small></div>` +
    `<div class="rw-panel" style="padding:14px">` +
    LEAGUE_TIERS.map(tierRow).join('') +
    `<div class="rw-lg-tier"><span class="rg">참여 보상 (P 1 이상 전원)</span><b>+${LEAGUE_JOIN_CASH.toLocaleString()}원</b></div>` +
    `</div>` +
    // 주사위 충전(mock)
    `<div class="rw-h2"><span>주사위 충전</span><small>많이 살수록 보너스 ↑</small></div>` +
    `<div class="rw-lg-packs">${DICE_PACKS.map(packCard).join('')}</div>` +
    `<p class="rw-note">※ 결제는 데모입니다 — 실제 인앱결제·시즌 정산은 백엔드(Phase B) 연동 시 활성화됩니다.</p>`;

  // 굴리기
  body.querySelector<HTMLButtonElement>('[data-roll]')?.addEventListener('click', () => {
    const r = rollDice(Date.now());
    if (!r) {
      toast('주사위가 없어요 — 광고를 보고 받아오세요 📺');
      return;
    }
    lastRoll = { face: r.face, gained: r.gained, jackpot: r.jackpot };
    toast(`${DICE_FACES[r.face - 1]} ${r.face}! ${r.jackpot ? '잭팟 🎉 ' : ''}+${r.gained.toLocaleString()}P`);
    ctx.rerender();
  });

  // 광고 → 주사위+P (mock: 즉시 지급, 시간대 보너스 반영)
  body.querySelector<HTMLButtonElement>('[data-lg-ad]')?.addEventListener('click', () => {
    const t = Date.now();
    addDice(AD_DICE, t);
    const gained = withSlotBonus(AD_PTS, t);
    addPts(gained, t);
    toast(`📺 광고 시청 완료 · 🎲+${AD_DICE} · P+${gained}`);
    ctx.rerender();
  });

  // 패키지 구매(mock)
  body.querySelectorAll<HTMLButtonElement>('[data-pack]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const p = DICE_PACKS[Number(btn.dataset.pack)];
      if (!p) return;
      addDice(p.n + p.bonus, Date.now());
      toast(`🎲 주사위 +${p.n + p.bonus}개 지급 (데모 — 실결제는 정식 오픈 후)`);
      ctx.rerender();
    }),
  );
}
