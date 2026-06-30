/**
 * Local 플랫폼 어댑터 — 백엔드 없이 localStorage 로 PlatformContext 를 구현.
 *
 * 현재 `@casual/core/liveops`(loadProfile/saveProfile + 순수 규칙)를 **그대로 위임**하므로
 * 기존 게임 동작과 1:1 동일하다(무회귀). 데모·오프라인·독립 폴백·테스트의 기본 어댑터.
 * Integrated/Standalone(원격) 어댑터는 같은 계약을 HTTP 백엔드로 구현해 P1/P3 에 추가한다.
 */
import {
  loadProfile,
  saveProfile,
  applyReward,
  spendCoins,
  spendGems,
  recordResult,
  syncLives,
  availableLives,
  msToNextLife,
  consumeLife,
  MAX_LIVES,
  canClaimDaily,
  claimDaily,
  SHOP_ITEMS,
  purchase as shopPurchase,
  canAfford,
  type Profile,
} from '../liveops/index.js';
import type { PlatformContext, Wallet } from './contract.js';

const DEVICE_KEY = 'playpop_device_id_v1';

/** 사용 가능한 localStorage(SSR/프라이빗 모드면 undefined). store.ts 와 동일 안전 접근. */
function safeLS(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

/** 로컬 익명 디바이스 id(없으면 생성·저장). 저장 불가 환경이면 휘발성 id. */
function deviceId(): string {
  const ls = safeLS();
  const existing = ls?.getItem(DEVICE_KEY);
  if (existing) return existing;
  // Math.random/Date.now 는 클라(브라우저)에서만 호출 — 서버 번들엔 포함되지 않는다.
  const id = `dev_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
  try {
    ls?.setItem(DEVICE_KEY, id);
  } catch {
    /* 저장 불가 — 휘발성 */
  }
  return id;
}

const walletOf = (p: Profile): Wallet => ({ coins: p.coins, gems: p.gems });
const nowMs = (): number => Date.now();

/** localStorage 기반 PlatformContext 생성(현 liveops 위임 = 무회귀). */
export function createLocalPlatform(): PlatformContext {
  const read = (): Profile => loadProfile();
  const write = (p: Profile): Profile => {
    saveProfile(p);
    return p;
  };

  return {
    mode: 'local',
    env: 'local',

    auth: {
      async current() {
        return { id: deviceId(), mode: 'local' };
      },
      async token() {
        return null; // 로컬 모드 = 서버 토큰 없음
      },
    },

    wallet: {
      async balance() {
        return walletOf(read());
      },
      async earn(reward) {
        return walletOf(write(applyReward(read(), reward)));
      },
      async spend(cost) {
        let p = read();
        if (cost.coins) {
          const r = spendCoins(p, cost.coins);
          if (!r) return 'insufficient';
          p = r;
        }
        if (cost.gems) {
          const r = spendGems(p, cost.gems);
          if (!r) return 'insufficient';
          p = r;
        }
        return walletOf(write(p));
      },
    },

    save: {
      async load() {
        const p = read();
        return { level: p.level, bestScore: p.bestScore };
      },
      async record(level, score, won) {
        const p = write(recordResult(read(), level, score, won));
        return { level: p.level, bestScore: p.bestScore };
      },
    },

    energy: {
      async state() {
        const p = syncLives(read(), nowMs());
        return { current: availableLives(p, nowMs()), max: MAX_LIVES, msToNext: msToNextLife(p, nowMs()) };
      },
      async consume() {
        const synced = syncLives(read(), nowMs());
        const next = consumeLife(synced, nowMs());
        if (!next) return 'empty';
        write(next);
        return { current: availableLives(next, nowMs()), max: MAX_LIVES, msToNext: msToNextLife(next, nowMs()) };
      },
    },

    daily: {
      async status() {
        const p = read();
        return { canClaim: canClaimDaily(p, nowMs()), streak: p.dailyStreak };
      },
      async claim() {
        const res = claimDaily(read(), nowMs());
        if (!res) return 'unavailable';
        // claimDaily 는 쿨다운/스트릭만 갱신 → 보상은 여기서 적용(허브 modals 와 동일 순서).
        const p = write(applyReward(res.profile, res.reward));
        return { reward: res.reward, streak: res.streak, wallet: walletOf(p) };
      },
    },

    shop: {
      async catalog() {
        const p = read();
        return SHOP_ITEMS.map((it) => ({
          id: it.id,
          label: it.label,
          cost: it.cost,
          grant: it.grant,
          affordable: canAfford(p, it),
        }));
      },
      async purchase(itemId) {
        const item = SHOP_ITEMS.find((i) => i.id === itemId);
        if (!item) return 'unknown';
        const next = shopPurchase(read(), item);
        if (!next) return 'insufficient';
        return walletOf(write(next));
      },
    },

    progress() {
      /* 로컬: 미션/업적/시즌 없음 — no-op. 원격 어댑터(P1)가 서버로 팬아웃. */
    },
    track() {
      /* 로컬: 분석 비활성 — no-op. */
    },
  };
}
