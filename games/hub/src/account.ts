/**
 * account — PlayPOP 포털 계정/경제(LiveOps) 허브 UI.
 *
 * 지갑(코인/젬/하트+재생타이머) 바를 렌더하고 상점/스핀/데일리 모달을 연다.
 * 프로필 로직·저장은 코어(@casual/core/liveops)가 단일 소스 — 허브는 표현만 담당.
 * (store HomeScene 의 게임-로컬 메타 허브를 포털 레벨로 이관.)
 */
import {
  loadProfile,
  saveProfile,
  type Profile,
  availableLives,
  msToNextLife,
  MAX_LIVES,
  syncLives,
  canClaimDaily,
} from '@casual/core/liveops';
import { openShop, openSpin, openDaily, openLeaderboard } from './modals.js';

/** 모달이 프로필을 읽고 갱신하기 위한 핸들. */
export interface AccountController {
  /** 현재 저장된 프로필(하트 재생 반영 전 값). */
  readonly profile: Profile;
  /** now 기준 하트 재생을 반영한 프로필 — 보상/구매 적용 전에 사용. */
  synced(now?: number): Profile;
  /** 새 프로필로 교체 + 저장 + HUD 갱신(불변 교체). */
  commit(next: Profile): void;
  /** 하단 토스트 메시지. */
  toast(msg: string): void;
}

/** 화면 하단 토스트(짧은 안내). */
export function toast(msg: string): void {
  const el = document.createElement('div');
  el.className = 'hub-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  window.setTimeout(() => el.classList.add('out'), 1800);
  window.setTimeout(() => el.remove(), 2500);
}

/** 계정/경제 바를 주어진 컨테이너에 마운트. */
export function mountAccountHub(bar: HTMLElement): void {
  // 진입 시 하트 재생 1회 반영 + 저장(이후 표시는 availableLives 로 read-only 갱신).
  let profile = syncLives(loadProfile(), Date.now());
  saveProfile(profile);

  bar.innerHTML =
    `<div class="wallet">` +
    `<span class="chip coin"><i>🪙</i><b id="acc-coins">0</b></span>` +
    `<span class="chip gem"><i>💎</i><b id="acc-gems">0</b></span>` +
    `<span class="chip heart"><i>❤</i><b id="acc-hearts">0</b><small id="acc-heart-timer"></small></span>` +
    `</div>` +
    `<div class="acc-actions">` +
    `<button class="acc-btn" id="acc-rank">🏆 랭킹</button>` +
    `<button class="acc-btn" id="acc-shop">🛒 상점</button>` +
    `<button class="acc-btn" id="acc-spin">🎡 스핀</button>` +
    `<button class="acc-btn" id="acc-daily">🎁 데일리<span class="dot-new" id="acc-daily-dot" hidden></span></button>` +
    `</div>`;

  const pick = (id: string): HTMLElement => bar.querySelector<HTMLElement>(`#${id}`)!;
  const coinsEl = pick('acc-coins');
  const gemsEl = pick('acc-gems');
  const heartsEl = pick('acc-hearts');
  const timerEl = pick('acc-heart-timer');
  const dailyDot = pick('acc-daily-dot');

  const refresh = (): void => {
    const now = Date.now();
    coinsEl.textContent = String(profile.coins);
    gemsEl.textContent = String(profile.gems);
    const lives = availableLives(profile, now);
    heartsEl.textContent = `${lives}/${MAX_LIVES}`;
    if (lives >= MAX_LIVES) {
      timerEl.textContent = 'FULL';
    } else {
      const ms = msToNextLife(profile, now);
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
    }
    dailyDot.hidden = !canClaimDaily(profile, now);
  };

  const ctrl: AccountController = {
    get profile(): Profile {
      return profile;
    },
    synced(now = Date.now()): Profile {
      return syncLives(profile, now);
    },
    commit(next: Profile): void {
      profile = next;
      saveProfile(profile);
      refresh();
    },
    toast,
  };

  pick('acc-rank').addEventListener('click', () => openLeaderboard(ctrl));
  pick('acc-shop').addEventListener('click', () => openShop(ctrl));
  pick('acc-spin').addEventListener('click', () => openSpin(ctrl));
  pick('acc-daily').addEventListener('click', () => openDaily(ctrl));

  refresh();
  // 하트 재생 타이머/데일리 가용 표시 1초 갱신.
  window.setInterval(refresh, 1000);
}
