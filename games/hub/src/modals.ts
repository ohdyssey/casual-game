/**
 * modals — 상점/스핀/데일리 모달(DOM). 로직은 코어(@casual/core/liveops) 순수 함수에 위임.
 * (store HomeScene 의 openShop/openSpin/openDaily 를 포털 허브 DOM 으로 이관.)
 */
import {
  type Reward,
  SHOP_ITEMS,
  purchase,
  canAfford,
  spin,
  canFreeSpin,
  SPIN_WHEEL,
  claimDaily,
  canClaimDaily,
  DAILY_REWARDS,
  applyReward,
} from '@casual/core/liveops';
import type { AccountController } from './account.js';
import { loadIdentity, saveIdentity, buildBoard, type RankRow } from './leaderboard.js';

/** HTML 특수문자 이스케이프 — 사용자 입력 아이디를 마크업에 안전하게 삽입. */
const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const rewardText = (r: Reward): string =>
  [
    r.coins && `코인 ${r.coins}`,
    r.gems && `젬 ${r.gems}`,
    r.lives && `하트 ${r.lives}`,
    r.hint && `힌트 ${r.hint}`,
    r.shuffle && `셔플 ${r.shuffle}`,
    r.undo && `되돌리기 ${r.undo}`,
  ]
    .filter(Boolean)
    .join(' · ');

/** 공용 오버레이 — 한 번에 하나만. body 와 close 핸들 반환. */
function overlay(title: string): { body: HTMLElement; close: () => void } {
  document.querySelectorAll('.modal-layer').forEach((el) => el.remove());
  const layer = document.createElement('div');
  layer.className = 'modal-layer';
  layer.innerHTML =
    `<div class="modal-panel" role="dialog" aria-modal="true" aria-label="${title}">` +
    `<div class="modal-head"><h2>${title}</h2><button class="modal-close" aria-label="닫기">✕</button></div>` +
    `<div class="modal-body"></div>` +
    `</div>`;
  const close = (): void => layer.remove();
  layer.addEventListener('click', (e) => {
    if (e.target === layer) close();
  });
  layer.querySelector('.modal-close')!.addEventListener('click', close);
  document.body.appendChild(layer);
  return { body: layer.querySelector<HTMLElement>('.modal-body')!, close };
}

/** 상점 — 코인/젬으로 파워업·하트·재화 구매. */
export function openShop(ctrl: AccountController): void {
  const { body } = overlay('상점');
  const render = (): void => {
    const p = ctrl.profile;
    body.innerHTML = '';
    for (const item of SHOP_ITEMS) {
      const afford = canAfford(p, item);
      const cost = item.cost.coins ? `🪙 ${item.cost.coins}` : `💎 ${item.cost.gems}`;
      const row = document.createElement('button');
      row.className = `list-row${afford ? '' : ' disabled'}`;
      row.disabled = !afford;
      row.innerHTML = `<span>${item.label}</span><span class="row-cost ${afford ? 'ok' : 'no'}">${cost}</span>`;
      row.addEventListener('click', () => {
        const bought = purchase(ctrl.synced(), item);
        if (!bought) {
          ctrl.toast('재화가 부족해요.');
          return;
        }
        ctrl.commit(bought);
        ctrl.toast(`구매 완료 · ${item.label}`);
        render();
      });
      body.appendChild(row);
    }
  };
  render();
}

/** 스핀 휠 — 무료(쿨다운) 또는 젬5 소모. */
export function openSpin(ctrl: AccountController): void {
  const { body } = overlay('스핀 휠');
  const render = (): void => {
    const free = canFreeSpin(ctrl.profile, Date.now());
    body.innerHTML =
      `<p class="modal-note">${free ? '무료 스핀 가능!' : '오늘 무료 스핀 완료'}</p>` +
      `<ul class="reward-preview">${SPIN_WHEEL.map((s) => `<li>${s.label}</li>`).join('')}</ul>`;
    const btn = document.createElement('button');
    btn.className = 'modal-cta';
    btn.textContent = free ? '🎡 무료 스핀' : '💎5 스핀';
    btn.addEventListener('click', () => {
      const now = Date.now();
      let p = ctrl.synced(now);
      if (!canFreeSpin(p, now)) {
        const paid = p.gems >= 5 ? applyReward(p, { gems: -5 }) : null;
        if (!paid) {
          ctrl.toast('젬이 부족해요.');
          return;
        }
        p = paid;
      }
      const result = spin(() => Math.random());
      p = applyReward(p, result.segment.reward);
      p = { ...p, lastSpinAt: now };
      ctrl.commit(p);
      ctrl.toast(`🎉 ${result.segment.label} 획득!`);
      render();
    });
    body.appendChild(btn);
  };
  render();
}

/** 데일리 — 7일 연속 보상(20h 쿨다운). */
export function openDaily(ctrl: AccountController): void {
  const { body } = overlay('데일리 보상');
  const render = (): void => {
    const p = ctrl.profile;
    const now = Date.now();
    const can = canClaimDaily(p, now);
    const rows = DAILY_REWARDS.map((r, i) => {
      const claimed =
        i < p.dailyStreak % DAILY_REWARDS.length ||
        (p.dailyStreak > 0 && !can && i === (p.dailyStreak - 1) % DAILY_REWARDS.length);
      return `<div class="list-row${claimed ? ' claimed' : ''}"><span>Day ${i + 1}</span><span>${rewardText(r)}</span></div>`;
    }).join('');
    body.innerHTML = `<div class="daily-list">${rows}</div>`;
    const btn = document.createElement('button');
    btn.className = 'modal-cta';
    btn.textContent = can ? '🎁 받기' : '내일 다시';
    btn.disabled = !can;
    btn.addEventListener('click', () => {
      const res = claimDaily(ctrl.synced(), Date.now());
      if (!res) {
        ctrl.toast('오늘은 이미 받았어요.');
        return;
      }
      ctrl.commit(applyReward(res.profile, res.reward));
      ctrl.toast(`🎁 ${rewardText(res.reward)} 획득!`);
      render();
    });
    body.appendChild(btn);
  };
  render();
}

/** 메달(1~3위) 또는 순위 숫자. */
const MEDAL: Record<number, string> = { 1: 'gold', 2: 'silver', 3: 'bronze' };

/** 랭킹 모드(우측 레일: 일일/주간/미션 랭킹). */
const LB_MODES = [
  { key: 'daily', label: '일일' },
  { key: 'weekly', label: '주간' },
  { key: 'mission', label: '미션' },
] as const;
export type LbMode = (typeof LB_MODES)[number]['key'];

/**
 * 랭크 & 리그 — 글로벌 랭킹(1~10위). 국가명이 아니라 플레이어 아이디를 노출(국기는 소속 국가).
 *   일일/주간/미션 탭 전환 지원(우측 레일 아이콘이 각 모드로 진입).
 */
export function openLeaderboard(ctrl: AccountController, mode: LbMode = 'daily'): void {
  const { body } = overlay('랭크 & 리그');
  let cur: LbMode = mode;

  const rowHtml = (r: RankRow): string => {
    const left = MEDAL[r.rank]
      ? `<span class="lb-medal ${MEDAL[r.rank]}">${r.rank}</span>`
      : `<span class="lb-num">${r.rank}</span>`;
    return (
      `<div class="lb-row${r.you ? ' me' : ''}"${r.you ? ' role="button" tabindex="0" title="아이디 변경"' : ''}>` +
      `<div class="lb-rank">${left}</div>` +
      `<div class="lb-body">` +
      `<span class="lb-flag"><img src="flags/flag_${esc(r.iso3)}.svg" alt="${esc(r.iso3)}" loading="lazy"></span>` +
      `<span class="lb-id">${esc(r.id)}${r.you ? ' <small>YOU</small>' : ''}</span>` +
      `<span class="lb-score">${r.score}</span>` +
      `</div></div>`
    );
  };

  const render = (): void => {
    const identity = loadIdentity();
    const board = buildBoard(identity, ctrl.profile, cur);
    const tabs = LB_MODES.map(
      (m) => `<button class="lb-tab${m.key === cur ? ' active' : ''}" data-mode="${m.key}" type="button">${m.label} 랭킹</button>`,
    ).join('');

    body.innerHTML =
      `<div class="lb-tabs">${tabs}</div>` +
      `<div class="lb-board">${board.map(rowHtml).join('')}</div>` +
      `<p class="modal-note">내 행을 눌러 아이디를 바꿀 수 있어요</p>`;

    // 탭 전환.
    body.querySelectorAll<HTMLButtonElement>('.lb-tab').forEach((t) => {
      t.addEventListener('click', () => {
        cur = t.dataset.mode as LbMode;
        render();
      });
    });

    // 내 행 클릭 → 아이디 변경(영속).
    const meRow = body.querySelector<HTMLElement>('.lb-row.me');
    const rename = (): void => {
      const next = window.prompt('새 아이디를 입력하세요', identity.id);
      const trimmed = next?.trim();
      if (!trimmed || trimmed === identity.id) return;
      saveIdentity({ ...identity, id: trimmed.slice(0, 16) });
      ctrl.toast('아이디를 변경했어요');
      render();
    };
    meRow?.addEventListener('click', rename);
    meRow?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        rename();
      }
    });
  };

  render();
}

/**
 * 리워드 — 플랫폼 1번 앱(2번 이미지). 게임 리워드가 아니라 '광고보고 현금성 보상' 앱테크.
 *   좌측 레일 티켓 아이콘으로 진입. 광고 시청·오퍼 참여로 코인/젬을 지급한다(데모: 세션 내 1회).
 */
export function openReward(ctrl: AccountController): void {
  const { body } = overlay('리워드');
  const claimed = new Set<string>();
  const OFFERS: { id: string; label: string; sub: string; reward: Reward }[] = [
    { id: 'ad', label: '영상 광고 시청', sub: '30초 광고를 보고 보상', reward: { coins: 200 } },
    { id: 'offer', label: '오퍼월 참여', sub: '앱 설치·미션 완료', reward: { gems: 5 } },
    { id: 'attend', label: '출석 리워드 광고', sub: '하루 1회 보너스', reward: { coins: 100, lives: 1 } },
  ];

  const render = (): void => {
    body.innerHTML =
      `<p class="modal-note">광고를 보고 리워드를 받으세요.<br>게임과 무관한 앱테크 리워드입니다.</p>`;
    for (const o of OFFERS) {
      const done = claimed.has(o.id);
      const row = document.createElement('button');
      row.className = `list-row${done ? ' claimed' : ''}`;
      row.disabled = done;
      row.type = 'button';
      row.innerHTML =
        `<span>${o.label}<small class="row-sub">${o.sub}</small></span>` +
        `<span class="row-cost ok">${done ? '완료' : '+ ' + rewardText(o.reward)}</span>`;
      row.addEventListener('click', () => {
        ctrl.commit(applyReward(ctrl.synced(), o.reward));
        claimed.add(o.id);
        ctrl.toast(`🎁 ${rewardText(o.reward)} 획득!`);
        render();
      });
      body.appendChild(row);
    }
  };
  render();
}

/**
 * 이벤트 — 쇼핑·게임 이벤트 목록(좌측 레일 파티 아이콘). 진행 중 이벤트 안내 + 오픈 기념 보상 참여.
 */
export function openEvent(ctrl: AccountController): void {
  const { body } = overlay('이벤트');
  let joined = false;

  const render = (): void => {
    body.innerHTML = `<p class="modal-note">진행 중인 이벤트</p>`;
    // 참여형(그랜드 오픈) 1개 + 안내형 2개.
    const grand = document.createElement('button');
    grand.className = `list-row${joined ? ' claimed' : ''}`;
    grand.disabled = joined;
    grand.type = 'button';
    grand.innerHTML =
      `<span>🏨 베가스 호텔 그랜드 오픈<small class="row-sub">신규 대표 게임 오픈 기념</small></span>` +
      `<span class="row-cost ok">${joined ? '참여완료' : '💎 5 받기'}</span>`;
    grand.addEventListener('click', () => {
      ctrl.commit(applyReward(ctrl.synced(), { gems: 5 }));
      joined = true;
      ctrl.toast('🎉 젬 5 획득!');
      render();
    });
    body.appendChild(grand);

    for (const info of [
      { label: '🪙 주말 코인 2배', sub: '토·일 플레이 보상 2배' },
      { label: '🏆 미션 랭킹 시즌', sub: '상위권 보상 지급' },
    ]) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML =
        `<span>${info.label}<small class="row-sub">${info.sub}</small></span><span class="row-cost">진행중</span>`;
      body.appendChild(row);
    }
  };
  render();
}

/**
 * 메뉴 — 우상단 메뉴 아이콘 진입. 포털의 모든 기능(리워드/이벤트/랭크/상점/스핀/데일리)을 한 곳에 모은다.
 */
export function openMenu(ctrl: AccountController): void {
  const { body, close } = overlay('메뉴');
  const items: { label: string; run: () => void }[] = [
    { label: '🎟️ 리워드 · 광고보고 보상', run: () => openReward(ctrl) },
    { label: '🎉 이벤트', run: () => openEvent(ctrl) },
    { label: '🏆 랭크 & 리그', run: () => openLeaderboard(ctrl, 'daily') },
    { label: '🛒 상점', run: () => openShop(ctrl) },
    { label: '🎡 스핀 휠', run: () => openSpin(ctrl) },
    { label: '🎁 데일리 보상', run: () => openDaily(ctrl) },
  ];
  for (const it of items) {
    const row = document.createElement('button');
    row.className = 'list-row';
    row.type = 'button';
    row.innerHTML = `<span>${it.label}</span><span aria-hidden="true">›</span>`;
    row.addEventListener('click', () => {
      close();
      it.run();
    });
    body.appendChild(row);
  }
}
