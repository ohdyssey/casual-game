/**
 * stockFan.ts — **스톡(뽑기) 더미 부채 배치** 순수 계산(Phaser-free).
 *
 * 더미는 왼쪽으로 부채처럼 펼쳐 남은 장수를 두께로 보여 준다. 그런데 장수가 많으면 왼쪽의
 * ＋5 아이콘 자리를 침범한다(PO 2026-08-22). 주어진 여유 폭 안에서 ① 기본 간격 → ② 좁힌 간격 →
 * ③ 2열 순으로 물러나며 **항상 폭 안에** 들어가게 한다.
 */

/** 한 장의 배치 — `y` 는 **카드 높이 배수**(0 = 기준줄, -0.3 = 윗줄). */
export interface FanSlot {
  readonly x: number;
  readonly y: number;
}

export interface FanLayout {
  /** i = 0(맨 아래·가장 왼쪽) … count-1(맨 위·곧 뽑힐 카드, 원점). */
  at(i: number): FanSlot;
  /** 실제로 차지한 폭(px) — 탭 존을 이만큼만 넓히면 된다. */
  readonly width: number;
  readonly rows: 1 | 2;
}

export function stockFanLayout(count: number, avail: number, step: number, minStep: number): FanLayout {
  if (count <= 1) return { at: () => ({ x: 0, y: 0 }), width: 0, rows: 1 };
  const need = (count - 1) * step;
  if (need <= avail) return { at: (i) => ({ x: -(count - 1 - i) * step, y: 0 }), width: need, rows: 1 };
  const fitted = avail / (count - 1);
  if (fitted >= minStep) return { at: (i) => ({ x: -(count - 1 - i) * fitted, y: 0 }), width: avail, rows: 1 };
  // 2열 — 뒤쪽(오래된) 절반이 윗줄, 앞쪽(곧 뽑힐) 절반이 기준줄.
  const per = Math.ceil(count / 2);
  const back = count - per;
  const s2 = Math.min(step, per > 1 ? avail / (per - 1) : step);
  return {
    at: (i) => {
      const upper = i < back;
      const n = upper ? back : per;
      const idx = upper ? i : i - back;
      return { x: -(n - 1 - idx) * s2, y: upper ? -0.3 : 0 };
    },
    width: (per - 1) * s2,
    rows: 2,
  };
}
