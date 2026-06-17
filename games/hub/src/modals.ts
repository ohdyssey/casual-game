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

/** 글로벌 랭킹 — 1~10위. 국가명이 아니라 플레이어 아이디를 노출(국기는 소속 국가). */
export function openLeaderboard(ctrl: AccountController): void {
  const { body } = overlay('글로벌 랭킹');

  const render = (): void => {
    const identity = loadIdentity();
    const board = buildBoard(identity, ctrl.profile);

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

    body.innerHTML =
      `<div class="lb-board">${board.map(rowHtml).join('')}</div>` +
      `<p class="modal-note">내 행을 눌러 아이디를 바꿀 수 있어요</p>`;

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
